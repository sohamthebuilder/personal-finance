/** Password rules and the one Unicode form (conditions 33, 43, 44). Made-up passwords only. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { deriveKey } from "../src/lib/db/encrypted-db.ts";
import { checkNewPassword, commonPasswords } from "../src/lib/auth/password-rules.ts";

const SALT = Buffer.alloc(16, 7);

describe("one Unicode form inside deriveKey (Decision 5)", () => {
  it("makes the same key for composed and decomposed é", async () => {
    const composed = "café au lait every morning";
    const decomposed = "café au lait every morning";
    assert.notEqual(composed, decomposed);
    assert.deepEqual(await deriveKey(composed, SALT), await deriveKey(decomposed, SALT));
  });

  it("makes the same key for full-width letters and their plain form", async () => {
    assert.deepEqual(await deriveKey("ｐａｓｓｐｈｒａｓｅ ｆｏｒ ｔｅｓｔｓ", SALT), await deriveKey("passphrase for tests", SALT));
  });

  it("refuses a lone surrogate, which would collide with another password", async () => {
    await assert.rejects(deriveKey("broken \ud800 text in a long phrase", SALT));
  });

  it("refuses over 1,024 code units before any hashing", async () => {
    const started = performance.now();
    await assert.rejects(deriveKey("a".repeat(1025), SALT), /too long/);
    assert.ok(performance.now() - started < 50, "no Argon2 work was done");
  });

  it("leaves plain ASCII unchanged, so earlier keys still match", async () => {
    const key = await deriveKey("made-up-password", SALT);
    assert.equal(key.length, 32);
  });
});

describe("new password rules (condition 33)", () => {
  it("needs 15 characters, counted as characters, not code units", () => {
    assert.equal(checkNewPassword("fourteen chars"), "TOO_SHORT");
    // 14 emoji are 28 code units, but only 14 characters.
    assert.equal(checkNewPassword("🌙🍵🌿🎈🎧🎲🎨🎬🎤🎯🎳🎷🎸🎺"), "TOO_SHORT");
    assert.equal(checkNewPassword("🌙🍵🌿🎈🎧🎲🎨🎬🎤🎯🎳🎷🎸🎺🎻"), null);
  });

  it("allows up to 256 characters and refuses more", () => {
    const words = "plum river lamp ";
    assert.equal(checkNewPassword(words.repeat(16)), "TOO_COMMON"); // a repeated unit
    const varied = Array.from({ length: 256 }, (_, i) => String.fromCodePoint(0x4e00 + i)).join("");
    assert.equal(checkNewPassword(varied), null);
    assert.equal(checkNewPassword(varied + "x"), "TOO_LONG");
  });

  it("doesn't trim spaces: they count", () => {
    assert.equal(checkNewPassword("  short phrase "), null);
    assert.equal(checkNewPassword("   tiny one    "), null);
    assert.equal(checkNewPassword(" tiny one "), "TOO_SHORT");
  });

  it("has no must-include rules", () => {
    assert.equal(checkNewPassword("green kettle on a slow tuesday"), null);
  });

  it("refuses a listed common password, in any case or width", () => {
    assert.equal(checkNewPassword("correcthorsebatterystaple"), "TOO_COMMON");
    assert.equal(checkNewPassword("CorrectHorseBatteryStaple"), "TOO_COMMON");
    assert.equal(checkNewPassword("ｃｏｒｒｅｃｔｈｏｒｓｅｂａｔｔｅｒｙｓｔａｐｌｅ"), "TOO_COMMON");
  });

  it("refuses one repeated character and a short unit repeated", () => {
    assert.equal(checkNewPassword("aaaaaaaaaaaaaaaa"), "TOO_COMMON");
    assert.equal(checkNewPassword("abcabcabcabcabcabc"), "TOO_COMMON");
    assert.equal(checkNewPassword("passwordpassword"), "TOO_COMMON");
  });

  it("refuses simple runs", () => {
    assert.equal(checkNewPassword("123456789012345"), "TOO_COMMON");
    assert.equal(checkNewPassword("abcdefghijklmno"), "TOO_COMMON");
    assert.equal(checkNewPassword("onmlkjihgfedcba"), "TOO_COMMON");
    assert.equal(checkNewPassword("qwertyuiopasdfg"), "TOO_COMMON");
  });

  it("refuses broken text", () => {
    assert.equal(checkNewPassword("broken \ud800 text in a long phrase"), "NOT_TEXT");
  });
});

describe("common-password list (Decision 7)", () => {
  it("sits beside the code, not in public/, with only lines of 15 or more", () => {
    const list = commonPasswords();
    assert.ok(list.size > 10);
    for (const entry of list) assert.ok(Array.from(entry).length >= 15, "entry under 15 characters");
    assert.throws(() => readFileSync("public/common-passwords.txt"));
  });

  it("is never imported by a page script", () => {
    for (const file of ["src/app/ui/create-password.tsx", "src/app/ui/client-tools.ts"]) {
      assert.doesNotMatch(readFileSync(file, "utf8"), /password-rules|common-passwords/);
    }
  });
});
