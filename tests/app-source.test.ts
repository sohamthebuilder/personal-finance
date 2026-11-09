/**
 * Checks on the app's own files (conditions 30, 31, 35, 50, D-010, Decision 1).
 * The built app is scanned for Google in tests/server.test.ts, after the build.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

function filesUnder(folder: string): string[] {
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

const SOURCE = filesUnder("src");
const PUBLIC = filesUnder("public");
const text = (file: string) => readFileSync(file, "utf8");


const GOOGLE_HOSTS = /fonts\.googleapis\.com|fonts\.gstatic\.com/;

describe("no Google and no font tricks (conditions 30, 31, 50)", () => {
  it("never names Google's font hosts in src/ or public/", () => {
    for (const file of [...SOURCE, ...PUBLIC].filter((name) => !name.endsWith(".woff2"))) {
      assert.doesNotMatch(text(file), GOOGLE_HOSTS, file);
    }
  });

  it("has no next/font/google, no @import and no src: local( in src/", () => {
    for (const file of SOURCE) {
      const body = text(file);
      assert.doesNotMatch(body, /next\/font\/google/, file);
      assert.doesNotMatch(body, /@import/, file);
      assert.doesNotMatch(body, /src:\s*local\(/, file);
    }
  });

  it("loads the font from one fixed local woff2 path only, with the system fallback in --font", () => {
    const fonts = text("src/app/fonts.css");
    assert.deepEqual(fonts.match(/url\([^)]*\)/g), ['url("/fonts/google-sans-flex.woff2")']);
    assert.match(fonts, /format\("woff2"\)/);
    assert.match(text("src/app/system.css"), /--font: "Google Sans Flex", -apple-system/);
  });

  it("keeps public/ to the font and its licence", () => {
    for (const file of PUBLIC) assert.ok(["public/fonts/google-sans-flex.woff2", "public/fonts/OFL.txt"].includes(file), file);
  });
});

describe("no server actions (Decision 1)", () => {
  it("has no \"use server\" anywhere in src/", () => {
    for (const file of SOURCE) assert.doesNotMatch(text(file), /["']use server["']/, file);
  });
});

describe("screens (condition 35, D-010)", () => {
  const screens = SOURCE.filter((file) => file.startsWith("src/app/") && /\.(tsx|ts)$/.test(file));

  it("never sets HTML from text", () => {
    for (const file of screens) assert.doesNotMatch(text(file), /dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML/, file);
  });

  it("has no inline styles in server-rendered HTML", () => {
    for (const file of screens) assert.doesNotMatch(text(file), /\bstyle=\{|style="/, file);
  });

  it("uses the design system's own stylesheet and icons, unchanged", () => {
    assert.equal(text("src/app/system.css"), text("docs/design-system/system.css"));
    const icons = text("docs/design-system/icons.svg").match(/<symbol id="i-[^"]+"/g) ?? [];
    const sprite = text("src/app/ui/icons.tsx");
    for (const symbol of icons) assert.ok(sprite.includes(symbol), symbol);
  });

  it("sizes only the header's own picker, not pickers in dialogs inside the header (Q4-1)", () => {
    const css = text("docs/design-system/system.css");
    assert.doesNotMatch(css, /\.top \.picker/);
    assert.equal(css.match(/\.top > \.picker \{/g)?.length, 3);
  });

  it("keeps passwords out of page state and logs", () => {
    for (const file of screens) {
      const body = text(file);
      assert.doesNotMatch(body, /console\.(log|error|warn|info|debug)/, file);
      assert.doesNotMatch(body, /localStorage\.setItem\([^)]*(password|token)/i, file);
    }
  });

  it("puts every password form on method=\"post\"", () => {
    for (const file of screens.filter((name) => text(name).includes("<form"))) {
      const forms = text(file).match(/<form[^>]*>/g) ?? [];
      for (const form of forms) assert.match(form, /method="post"/, file);
    }
  });
});
