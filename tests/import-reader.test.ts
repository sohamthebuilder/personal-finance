import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseExport, toPaise } from "../src/lib/import/parse-export.ts";
import { countUnpacked, LIMITS, XML_OPTIONS, ZIP_OPTIONS } from "../src/lib/import/xlsx-reader.ts";
import { buildZip, type SheetCell, sharedStringsXml, sheetXml, type ZipPart } from "../src/lib/sample/xlsx-writer.ts";
import { assertRejected, HEADER, rejection, row, workbook } from "./support/import-helpers.ts";

const MB = 1024 * 1024;
const SHEET = "xl/worksheets/sheet1.xml";
const WORKBOOK = "xl/workbook.xml";
const LINKS = "xl/_rels/workbook.xml.rels";
const TYPES = "[Content_Types].xml";
const SHARED = "xl/sharedStrings.xml";

const pad = (name: string, size: number): ZipPart => ({ name, data: Buffer.alloc(size), store: true });

function rawSheet(inner: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet><sheetData>${inner}</sheetData></worksheet>`;
}

/** A sheet with the normal header, then the given XML as what follows it. */
function sheetWithHeader(after: string): Record<string, string> {
  const strings = new Map<string, number>();
  const header = sheetXml([HEADER], strings);
  return { [SHEET]: header.replace("</sheetData>", `${after}</sheetData>`) };
}

describe("limits", () => {
  it("match the approved numbers", () => {
    assert.deepEqual(LIMITS, {
      maxFileBytes: 20 * MB,
      maxUnpackedBytes: 200 * MB,
      maxDataRows: 100_000,
      maxZipEntries: 100,
      maxColumns: 12,
      maxCellChars: 32_767,
      maxTotalCellChars: 200 * MB,
      maxXmlDepth: 64,
      maxXmlAttributes: 64,
    });
  });

  it("security settings stay as required", () => {
    assert.equal(ZIP_OPTIONS.validateEntrySizes, true);
    assert.equal(ZIP_OPTIONS.strictFileNames, true);
    assert.equal(XML_OPTIONS.unparsedEntities, false);
    assert.equal(XML_OPTIONS.strictEntities, true);
  });

  it("AC-17: accepts a file of exactly 20 MB and refuses one byte more", async () => {
    const base = workbook([row()], { extraParts: [pad("docProps/pad.bin", 0)] }).length;
    const exact = workbook([row()], { extraParts: [pad("docProps/pad.bin", LIMITS.maxFileBytes - base)] });
    assert.equal(exact.length, LIMITS.maxFileBytes);
    assert.equal((await parseExport(exact)).rows.length, 1);
    const over = workbook([row()], { extraParts: [pad("docProps/pad.bin", LIMITS.maxFileBytes - base + 1)] });
    await assertRejected(over, "FILE_TOO_LARGE");
  });

  it("AC-17: refuses by declared size before anything is unpacked", async () => {
    const stats = { bytesUnpacked: 0 };
    const part: ZipPart = { name: "docProps/big.bin", data: "x", declaredSize: 200 * MB + 1 };
    await assertRejected(workbook([row()], { extraParts: [part] }), "UNPACKED_TOO_LARGE", undefined, stats);
    assert.equal(stats.bytesUnpacked, 0);
  });

  it("AC-17: declared sizes at exactly the limit pass the directory check", async () => {
    const plain = workbook();
    const limits = { ...LIMITS, maxUnpackedBytes: 5000 };
    const part = (size: number): ZipPart => ({ name: "docProps/x.bin", data: Buffer.alloc(size), store: true });
    const standard = await measureDeclared(plain);
    assert.equal((await parseExport(workbook([row()], { extraParts: [part(5000 - standard)] }), limits)).rows.length, 1);
    await assertRejected(workbook([row()], { extraParts: [part(5001 - standard)] }), "UNPACKED_TOO_LARGE", limits);
  });

  it("AC-17: a zip bomb is refused with nothing unpacked", async () => {
    const stats = { bytesUnpacked: 0 };
    const bomb = workbook([row()], { extraParts: [{ name: "xl/media/bomb.bin", data: Buffer.alloc(210 * MB) }] });
    assert.ok(bomb.length < MB, "the bomb must be small when packed");
    await assertRejected(bomb, "UNPACKED_TOO_LARGE", undefined, stats);
    assert.equal(stats.bytesUnpacked, 0);
  });

  it("AC-17: a file lying about its size stops during unpacking, at the first chunk", async () => {
    const stats = { bytesUnpacked: 0 };
    const filler = " ".repeat(50 * MB);
    const liar = buildZip([
      { name: TYPES, data: '<?xml version="1.0"?><Types/>' },
      {
        name: WORKBOOK,
        data: '<?xml version="1.0"?><workbook xmlns:r="x"><sheets><sheet r:id="rId1"/></sheets></workbook>',
      },
      { name: LINKS, data: '<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>' },
      { name: SHEET, data: filler, declaredSize: 100 },
    ]);
    await assertRejected(liar, "DAMAGED_FILE", undefined, stats);
    assert.ok(stats.bytesUnpacked < MB, "unpacking must stop long before the real size");
  });

  it("AC-17: accepts 100 zip entries and refuses 101", async () => {
    const parts = (count: number): ZipPart[] =>
      Array.from({ length: count }, (_, index) => ({ name: `docProps/p${index}.bin`, data: "x", store: true }));
    const standardParts = 6;
    assert.equal((await parseExport(workbook([row()], { extraParts: parts(100 - standardParts) }))).rows.length, 1);
    await assertRejected(workbook([row()], { extraParts: parts(101 - standardParts) }), "TOO_MANY_ENTRIES");
  });

  it("AC-17: overlapping entries count every time, so they can't dodge the limit", async () => {
    const aliases = Array.from({ length: 9 }, (_, index) => `docProps/copy${index}.bin`);
    const overlap: ZipPart = { name: "docProps/data.bin", data: Buffer.alloc(30 * MB), aliases };
    await assertRejected(workbook([row()], { extraParts: [overlap] }), "UNPACKED_TOO_LARGE");
  });

  it("AC-17: two entries with the same name, ignoring case, are refused", async () => {
    await assertRejected(workbook([row()], { extraParts: [{ name: "XL/WORKBOOK.XML", data: "<a/>" }] }), "BAD_STRUCTURE");
  });

  it("AC-17: exactly 12 columns are fine and a 13th is refused", async () => {
    await assertRejected(workbook([[...row(), "Made-up extra"]]), "TOO_MANY_COLUMNS");
  });

  it("AC-17: exactly one sheet is required", async () => {
    const twoSheets =
      '<?xml version="1.0"?><workbook xmlns:r="x"><sheets><sheet r:id="rId1"/><sheet r:id="rId2"/></sheets></workbook>';
    await assertRejected(workbook([row()], { overrides: { [WORKBOOK]: twoSheets } }), "NOT_ONE_SHEET");
    const noSheets = '<?xml version="1.0"?><workbook><sheets/></workbook>';
    await assertRejected(workbook([row()], { overrides: { [WORKBOOK]: noSheets } }), "NOT_ONE_SHEET");
  });

  it("AC-17: the row limit is exact, and the header doesn't count", async () => {
    const limits = { ...LIMITS, maxDataRows: 3 };
    assert.equal((await parseExport(workbook([row(), row(), row()]), limits)).rows.length, 3);
    await assertRejected(workbook([row(), row(), row(), row()]), "TOO_MANY_ROWS", limits);
  });

  it("AC-17: empty rows count towards the row limit", async () => {
    const empties = Array.from({ length: 5 }, (_, index) => `<row r="${index + 2}"/>`).join("");
    await assertRejected(workbook([], { overrides: sheetWithHeader(empties) }), "TOO_MANY_ROWS", {
      ...LIMITS,
      maxDataRows: 4,
    });
  });

  it("AC-17: a full-size file of 100,000 rows is read, and one more is refused", async () => {
    const rows = Array.from({ length: LIMITS.maxDataRows }, () => row());
    assert.equal((await parseExport(workbook(rows))).rows.length, LIMITS.maxDataRows);
    rows.push(row());
    await assertRejected(workbook(rows), "TOO_MANY_ROWS");
  });

  it("AC-17: a cell of 32,767 characters is fine and one more is refused", async () => {
    const longest = "x".repeat(LIMITS.maxCellChars);
    const { rows } = await parseExport(workbook([row({ note: longest })]));
    assert.equal(rows[0]?.note.length, LIMITS.maxCellChars);
    await assertRejected(workbook([row({ note: `${longest}x` })]), "CELL_TOO_LONG");
    const inline = { attributes: 't="inlineStr"', inner: `<is><t>${longest}x</t></is>` };
    await assertRejected(workbook([row({ note: inline })]), "CELL_TOO_LONG");
  });

  it("AC-17: the cell limit covers the whole cell, however many pieces it's split into", async () => {
    const piece = `<r><t>${"a".repeat(20_000)}</t></r>`;
    await assertRejected(
      workbook([row({ note: { attributes: 't="inlineStr"', inner: `<is>${piece}${piece}</is>` } })]),
      "CELL_TOO_LONG",
    );
    const exact = `<r><t>${"a".repeat(30_000)}</t></r><r><t>${"b".repeat(2_767)}</t></r>`;
    const { rows } = await parseExport(
      workbook([row({ note: { attributes: 't="inlineStr"', inner: `<is>${exact}</is>` } })]),
    );
    assert.equal(rows[0]?.note.length, LIMITS.maxCellChars);
  });

  it("AC-17: the running byte count stops at the limit", () => {
    const stats = { bytesUnpacked: 0 };
    const limits = { ...LIMITS, maxUnpackedBytes: 10 };
    countUnpacked(10, stats, limits);
    assert.equal(stats.bytesUnpacked, 10);
    assert.throws(() => countUnpacked(1, stats, limits), { code: "UNPACKED_TOO_LARGE" });
  });

  it("AC-17: shared text multiplied by many cells is refused at the real limit", async () => {
    const big = "y".repeat(LIMITS.maxCellChars);
    const rows = Array.from({ length: 6500 }, () => row({ note: big }));
    const file = workbook(rows);
    assert.ok(file.length < MB, "the file must be small when packed");
    await assertRejected(file, "TOO_MUCH_TEXT");
  });

  it("AC-17: the total text limit is exact", async () => {
    const rows = [row()];
    const total = [...HEADER, ...rows.flat()].reduce<number>(
      (sum, cell) => sum + (cell === null ? 0 : String(cell).length),
      0,
    );
    assert.equal((await parseExport(workbook(rows), { ...LIMITS, maxTotalCellChars: total })).rows.length, 1);
    await assertRejected(workbook(rows), "TOO_MUCH_TEXT", { ...LIMITS, maxTotalCellChars: total - 1 });
  });
});

describe("wrong files", () => {
  it("AC-16: wrong column names and wrong order", async () => {
    const renamed = [...HEADER];
    renamed[5] = "Rupees";
    await assertRejected(buildSheet([renamed, row()]), "WRONG_COLUMNS");
    const swapped = [...HEADER];
    [swapped[0], swapped[1]] = [swapped[1] as SheetCell, swapped[0] as SheetCell];
    await assertRejected(buildSheet([swapped, row()]), "WRONG_COLUMNS");
    await assertRejected(buildSheet([HEADER.slice(0, 11), row()]), "WRONG_COLUMNS");
  });

  it("AC-16: empty files", async () => {
    await assertRejected(new Uint8Array(0), "EMPTY_FILE");
    await assertRejected(workbook([]), "EMPTY_FILE");
  });

  it("AC-16: a sheet with no rows at all", async () => {
    await assertRejected(workbook([], { overrides: { [SHEET]: rawSheet("") } }), "EMPTY_FILE");
  });

  it("AC-16: files that aren't Excel, whatever they're called", async () => {
    await assertRejected(Buffer.from("<html><table><tr><td>made up</td></tr></table></html>"), "NOT_EXCEL");
    await assertRejected(Buffer.from("Period,Accounts\n"), "NOT_EXCEL");
    await assertRejected(buildZip([{ name: "readme.txt", data: "made up" }]), "NOT_EXCEL");
  });

  it("AC-16: password-protected and old-format files", async () => {
    const oldOffice = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    await assertRejected(oldOffice, "PROTECTED_OR_OLD_FILE");
    const encrypted = workbook([row()], { extraParts: [{ name: "docProps/x.bin", data: "x", encrypted: true }] });
    await assertRejected(encrypted, "PROTECTED_OR_OLD_FILE");
  });

  it("AC-16: macro files", async () => {
    await assertRejected(workbook([row()], { extraParts: [{ name: "xl/vbaProject.bin", data: "x" }] }), "MACRO_FILE");
    const types =
      '<?xml version="1.0"?><Types><Override PartName="/xl/workbook.xml" ' +
      'ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"/></Types>';
    await assertRejected(workbook([row()], { overrides: { [TYPES]: types } }), "MACRO_FILE");
  });

  it("AC-16: unknown compression", async () => {
    const part: ZipPart = { name: "docProps/x.bin", data: "x", store: true, method: 12 };
    await assertRejected(workbook([row()], { extraParts: [part] }), "BAD_STRUCTURE");
  });

  it("AC-16: a cut-off file", async () => {
    const file = workbook();
    const error = await rejection(file.subarray(0, Math.floor(file.length / 2)));
    assert.equal(error.code, "DAMAGED_FILE");
  });

  it("AC-16: one flipped byte in an amount is caught by the checksum", async () => {
    const file = Buffer.from(workbook([row({ inr: 123456.78 })], { store: true }));
    const at = file.indexOf("<v>123456.78</v>");
    assert.ok(at > 0);
    const flipped = Buffer.from(file);
    flipped[at + 3] = "9".charCodeAt(0);
    await assertRejected(flipped, "DAMAGED_FILE");
  });

  it("AC-16: broken XML", async () => {
    await assertRejected(workbook([row()], { overrides: { [SHEET]: "<worksheet><sheetData>" } }), "DAMAGED_FILE");
    await assertRejected(workbook([row()], { overrides: { [SHEET]: "<<<" } }), "DAMAGED_FILE");
  });

  it("AC-16: text that isn't valid UTF-8", async () => {
    const part = Buffer.concat([Buffer.from("<a>"), Buffer.from([0xff, 0xfe]), Buffer.from("</a>")]);
    const file = buildZip([
      { name: TYPES, data: part },
      { name: WORKBOOK, data: "<a/>" },
    ]);
    await assertRejected(file, "DAMAGED_FILE");
  });

  it("AC-16: missing parts", async () => {
    await assertRejected(workbook([row()], { overrides: { [WORKBOOK]: null } }), "NOT_EXCEL");
    await assertRejected(workbook([row()], { overrides: { [LINKS]: null } }), "NOT_EXCEL");
    await assertRejected(workbook([row()], { overrides: { [SHEET]: null } }), "NOT_EXCEL");
    await assertRejected(workbook([row()], { overrides: { [SHARED]: null } }), "NOT_EXCEL");
  });
});

function buildSheet(rows: ReadonlyArray<readonly SheetCell[]>): Uint8Array {
  const [first, ...rest] = rows;
  const strings = new Map<string, number>();
  const sheet = sheetXml([first ?? [], ...rest], strings);
  const items = [...strings.keys()].map((text) => `<si><t>${text}</t></si>`).join("");
  return workbook([], { overrides: { [SHEET]: sheet, [SHARED]: `<?xml version="1.0"?><sst>${items}</sst>` } });
}

async function measureDeclared(file: Uint8Array): Promise<number> {
  const bytes = Buffer.from(file);
  const entries = bytes.readUInt16LE(bytes.length - 22 + 10);
  let at = bytes.readUInt32LE(bytes.length - 22 + 16);
  let total = 0;
  for (let index = 0; index < entries; index += 1) {
    total += bytes.readUInt32LE(at + 24);
    at += 46 + bytes.readUInt16LE(at + 28);
  }
  return total;
}

describe("harmful content", () => {
  const doctype = '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "made up">]>';

  it("AC-18: a DOCTYPE is refused in every part that's read", async () => {
    const standard = {
      [TYPES]: `${doctype}<Types/>`,
      [WORKBOOK]: `${doctype}<workbook/>`,
      [LINKS]: `${doctype}<Relationships/>`,
      [SHARED]: `${doctype}<sst/>`,
      [SHEET]: `${doctype}<worksheet/>`,
    };
    for (const [part, xml] of Object.entries(standard)) {
      await assertRejected(workbook([row()], { overrides: { [part]: xml } }), "UNSAFE_XML");
    }
  });

  it("AC-18: entity expansion attacks are refused", async () => {
    const laughs =
      '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;">]>' +
      "<sst><si><t>&b;</t></si></sst>";
    await assertRejected(workbook([row()], { overrides: { [SHARED]: laughs } }), "UNSAFE_XML");
  });

  it("AC-18: an undeclared entity is refused", async () => {
    const xml = '<?xml version="1.0"?><sst><si><t>&made_up;</t></si></sst>';
    await assertRejected(workbook([row()], { overrides: { [SHARED]: xml } }), "DAMAGED_FILE");
  });

  it("AC-18: XML that isn't UTF-8 is refused", async () => {
    const xml = '<?xml version="1.0" encoding="UTF-16"?><sst/>';
    await assertRejected(workbook([row()], { overrides: { [SHARED]: xml } }), "UNSAFE_XML");
  });

  it("AC-18: a real formula in an amount, date, type or account column rejects the file", async () => {
    const formula = { inner: "<f>1+1</f><v>2</v>" };
    const stringFormula = { attributes: 't="str"', inner: "<f>TEXT(1,0)</f><v>15/01/2024, 10:30:00</v>" };
    const error = await assertRejected(workbook([row(), row({ inr: formula })]), "FORMULA_IN_VALUE");
    assert.deepEqual(error.rows, [3]);
    await assertRejected(workbook([row({ amount: formula })]), "FORMULA_IN_VALUE");
    await assertRejected(workbook([row({ period: stringFormula })]), "FORMULA_IN_VALUE");
    const textFormula = (text: string) => ({ attributes: 't="str"', inner: `<f>TEXT(1,0)</f><v>${text}</v>` });
    await assertRejected(workbook([row({ type: textFormula("Exp.") })]), "FORMULA_IN_VALUE");
    await assertRejected(workbook([row({ account: textFormula("Made-up Account") })]), "FORMULA_IN_VALUE");
  });

  it("AC-18: a formula elsewhere is never run, and only its stored text is kept", async () => {
    const note = { attributes: 't="str"', inner: "<f>WEBSERVICE(&quot;http://example.invalid&quot;)</f><v>Made-up stored</v>" };
    const { rows } = await parseExport(workbook([row({ note })]));
    assert.equal(rows[0]?.note, "Made-up stored");
  });

  it("AC-18: formula-looking text stays as text", async () => {
    const { rows } = await parseExport(workbook([row({ note: "=1+1", category: "<b>x</b>" })]));
    assert.equal(rows[0]?.note, "=1+1");
    assert.equal(rows[0]?.category, "<b>x</b>");
  });

  it("AC-19: zip entries that try to leave the folder are refused", async () => {
    for (const name of ["../evil.xml", "/etc/made-up.xml", "xl\\..\\evil.xml", "xl/../../evil.xml"]) {
      await assertRejected(workbook([row()], { extraParts: [{ name, data: "x" }] }), "DAMAGED_FILE");
    }
  });

  it("AC-19: link targets are compared with fixed names, never followed", async () => {
    const links = (target: string, extra = "") =>
      `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="${target}"${extra}/></Relationships>`;
    for (const target of ["../../evil.xml", "/etc/made-up.xml", "worksheets/../../evil.xml", "evil.xml"]) {
      await assertRejected(workbook([row()], { overrides: { [LINKS]: links(target) } }), "BAD_STRUCTURE");
    }
    const external = links("http://example.invalid/made-up.xml", ' TargetMode="External"');
    await assertRejected(workbook([row()], { overrides: { [LINKS]: external } }), "EXTERNAL_LINK");
    await assertRejected(workbook([row()], { extraParts: [{ name: "xl/externalLinks/link1.xml", data: "x" }] }), "EXTERNAL_LINK");
  });

  it("AC-19: a linked shared-strings part must be the standard one", async () => {
    const links =
      '<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="x/sharedStrings" Target="../secrets.xml"/></Relationships>';
    await assertRejected(workbook([row()], { overrides: { [LINKS]: links } }), "BAD_STRUCTURE");
  });
});

describe("odd cells and rows", () => {
  it("columns come from each cell's reference, so empty cells never shift values", async () => {
    const { rows } = await parseExport(workbook([row({ category: null, subcategory: null, note: null })]));
    assert.equal(rows[0]?.category, "");
    assert.equal(rows[0]?.note, "");
    assert.equal(rows[0]?.amountPaise, 100_50);
    assert.equal(rows[0]?.type, "Exp.");
  });

  it("refuses rows and cells that are out of order or badly labelled", async () => {
    const data = (inner: string) => workbook([], { overrides: sheetWithHeader(inner) });
    await assertRejected(data('<row r="1"/>'), "BAD_STRUCTURE");
    await assertRejected(data('<row r="3"/><row r="2"/>'), "BAD_STRUCTURE");
    await assertRejected(data("<row/>"), "BAD_STRUCTURE");
    await assertRejected(data('<row r="x"/>'), "BAD_STRUCTURE");
    await assertRejected(data('<row r="2"><c r="B2"><v>1</v></c><c r="A2"><v>1</v></c></row>'), "BAD_STRUCTURE");
    await assertRejected(data('<row r="2"><c r="A3"><v>1</v></c></row>'), "BAD_STRUCTURE");
    await assertRejected(data('<row r="2"><c><v>1</v></c></row>'), "BAD_STRUCTURE");
    await assertRejected(data('<row r="2"><c r="a2"><v>1</v></c></row>'), "BAD_STRUCTURE");
    await assertRejected(data('<row r="2"><c r="A2" t="s"><v>99999</v></c></row>'), "BAD_STRUCTURE");
    await assertRejected(data('<row r="2"><c r="A2" t="s"><v>-1</v></c></row>'), "BAD_STRUCTURE");
  });

  it("refuses nesting and repeats that would lose or merge data", async () => {
    const data = (inner: string) => workbook([], { overrides: sheetWithHeader(inner) });
    const good = '<c r="A3"><v>1</v></c>';
    await assertRejected(data(`<row r="2"><row r="3">${good}</row></row>`), "BAD_STRUCTURE");
    await assertRejected(data('<row r="2"><c r="A2"><c r="B2"><v>1</v></c></c></row>'), "BAD_STRUCTURE");
    await assertRejected(data('<row r="2"><c r="A2"><v>1</v><v>2</v></c></row>'), "BAD_STRUCTURE");
    await assertRejected(data('<row r="2"><c r="A2"><v><v>1</v></v></c></row>'), "BAD_STRUCTURE");
    await assertRejected(data('<row r="2"><c r="A2"><v>1</v><is><t>2</t></is></c></row>'), "BAD_STRUCTURE");
    await assertRejected(data('<row r="2"><c r="A2" t="inlineStr"><v>1</v><is><t>2</t></is></c></row>'), "BAD_STRUCTURE");
    const nestedItem = '<?xml version="1.0"?><sst><si><si><t>x</t></si></si></sst>';
    await assertRejected(workbook([row()], { overrides: { [SHARED]: nestedItem } }), "BAD_STRUCTURE");
  });

  it("refuses kinds of cell it doesn't understand", async () => {
    for (const type of ["e", "b", "d", "made-up"]) {
      const cell = { attributes: `t="${type}"`, inner: "<v>1</v>" };
      await assertRejected(workbook([row({ note: cell })]), "UNSUPPORTED_CELL");
    }
  });

  it("refuses a second data block", async () => {
    const xml = rawSheet("").replace("</worksheet>", "<sheetData/></worksheet>");
    await assertRejected(workbook([row()], { overrides: { [SHEET]: xml } }), "BAD_STRUCTURE");
  });

  it("skips fully empty rows but keeps sheet row numbers", async () => {
    const { rows } = await parseExport(workbook([new Array<SheetCell>(12).fill(null), row()]));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.rowNumber, 3);
  });

  it("AC-5: an unknown type is reported by row number and never guessed", async () => {
    const error = await assertRejected(workbook([row(), row({ type: "Made-up" }), row()]), "UNKNOWN_ROW_TYPE");
    assert.deepEqual(error.rows, [3]);
    assert.equal(error.rowCount, 1);
    await assertRejected(workbook([row({ type: "exp." })]), "UNKNOWN_ROW_TYPE");
    await assertRejected(workbook([row({ type: null })]), "UNKNOWN_ROW_TYPE");
    await assertRejected(workbook([row({ type: "__proto__" })]), "UNKNOWN_ROW_TYPE");
  });

  it("lists at most 20 rows but gives the full count", async () => {
    const rows = Array.from({ length: 25 }, () => row({ type: "Made-up" }));
    const error = await assertRejected(workbook(rows), "UNKNOWN_ROW_TYPE");
    assert.equal(error.rows.length, 20);
    assert.equal(error.rowCount, 25);
  });

  it("refuses a row with no account", async () => {
    await assertRejected(workbook([row({ account: null })]), "MISSING_ACCOUNT");
  });

  it("reads dates as shown by the owner, day first", async () => {
    const { rows } = await parseExport(workbook([row({ period: "30/11/2026, 04:26:01" })]));
    assert.equal(rows[0]?.occurredAt, "2026-11-30T04:26:01");
  });

  it("also reads dates stored as Excel date numbers", async () => {
    const { rows } = await parseExport(workbook([row({ period: 46356.5 })]));
    assert.equal(rows[0]?.occurredAt, "2026-11-30T12:00:00");
  });

  it("honours the 1904 date setting", async () => {
    const { rows } = await parseExport(workbook([row({ period: 46356.5 - 1462 })], { uses1904Dates: true }));
    assert.equal(rows[0]?.occurredAt, "2026-11-30T12:00:00");
  });

  it("refuses impossible dates", async () => {
    for (const period of [
      "31/02/2026, 10:00:00",
      "13/13/2026, 10:00:00",
      "15/01/2024, 25:00:00",
      "15/01/2024",
      "01-15-2024",
      "not a date",
      -5,
      10,
      99999999,
      null,
    ]) {
      await assertRejected(workbook([row({ period })]), "BAD_DATE");
    }
  });

  it("refuses amounts that aren't plain safe numbers", async () => {
    for (const inr of ["NaN", "Infinity", "1,234.50", "12abc", "", "0x10", "1e99", "99999999999999999", null]) {
      await assertRejected(workbook([row({ inr })]), "BAD_AMOUNT");
    }
  });

  it("converts amounts to paise exactly, with no floating-point drift", () => {
    const cases: Array<[string, number]> = [
      ["0", 0],
      ["100.5", 100_50],
      ["-1234.56", -1234_56],
      ["0.07", 7],
      ["0.1", 10],
      ["1.1", 1_10],
      ["1234.5600000000001", 1234_56],
      ["1234.5599999999999", 1234_56],
      ["1.2345E3", 1234_50],
      ["1E-2", 1],
      ["90071992547409.91", 9007199254740991],
    ];
    for (const [text, paise] of cases) assert.equal(toPaise(text)?.paise, paise, text);
    assert.equal(toPaise("90071992547409.92"), null);
  });

  it("counts amounts with real detail below a paisa, but not number noise", async () => {
    assert.equal(toPaise("12.345")?.rounded, true);
    assert.equal(toPaise("12.345")?.paise, 12_35);
    assert.equal(toPaise("1234.5600000000001")?.rounded, false);
    const { roundedAmounts } = await parseExport(workbook([row({ inr: 12.345 }), row()]));
    assert.equal(roundedAmounts, 1);
  });

  it("only the reader's fixed error type ever escapes", async () => {
    const file = workbook([row({ note: { attributes: 't="e"', inner: "<v>#N/A</v>" } })]);
    const error = await rejection(file);
    assert.equal(error.name, "ImportRejected");
  });
});

/** Every part the reader opens, each with the given XML just inside its top element. */
function partsHolding(inner: string): Record<string, string> {
  const strings = new Map<string, number>();
  const sheet = sheetXml([HEADER, row()], strings);
  return {
    [TYPES]: `<?xml version="1.0"?><Types>${inner}</Types>`,
    [WORKBOOK]: `<?xml version="1.0"?><workbook xmlns:r="x">${inner}<sheets><sheet r:id="rId1"/></sheets></workbook>`,
    [LINKS]:
      `<?xml version="1.0"?><Relationships>${inner}<Relationship Id="rId1" Target="worksheets/sheet1.xml"/>` +
      '<Relationship Id="rId2" Type="x/sharedStrings" Target="sharedStrings.xml"/></Relationships>',
    // Shared strings only allow unknown content inside extLst, so that takes the place of the outer `a`.
    [SHARED]: sharedStringsXml(strings).replace("<si>", `${inner.replace(/^<a\b/, "<extLst").replace(/<\/a>$/, "</extLst>")}<si>`),
    [SHEET]: sheet.replace("<sheetData>", `${inner}<sheetData>`),
  };
}

const nested = (levels: number): string => "<a>".repeat(levels) + "</a>".repeat(levels);
const attributeList = (count: number): string =>
  Array.from({ length: count }, (_, index) => `a${index}=""`).join(" ");

describe("S-1: nesting and attribute limits", () => {
  // The top element is level 1, so the nest inside it reaches the limit one level short of it.
  const deepest = LIMITS.maxXmlDepth - 1;

  it("nesting at the limit is fine in every part, and one level more is refused", async () => {
    for (const part of Object.keys(partsHolding(""))) {
      const atLimit = partsHolding(nested(deepest))[part] as string;
      assert.equal((await parseExport(workbook([row()], { overrides: { [part]: atLimit } }))).rows.length, 1, part);
      const over = partsHolding(nested(deepest + 1))[part] as string;
      await assertRejected(workbook([row()], { overrides: { [part]: over } }), "BAD_STRUCTURE");
    }
  });

  it("attributes at the limit are fine in every part, and one more is refused", async () => {
    for (const part of Object.keys(partsHolding(""))) {
      const atLimit = partsHolding(`<a ${attributeList(LIMITS.maxXmlAttributes)}/>`)[part] as string;
      assert.equal((await parseExport(workbook([row()], { overrides: { [part]: atLimit } }))).rows.length, 1, part);
      const over = partsHolding(`<a ${attributeList(LIMITS.maxXmlAttributes + 1)}/>`)[part] as string;
      await assertRejected(workbook([row()], { overrides: { [part]: over } }), "BAD_STRUCTURE");
    }
  });

  it("the attribute limit also covers a cell, and the top element", async () => {
    const cell = (count: number) => ({ attributes: attributeList(count), inner: "<v>100.5</v>" });
    const limit = LIMITS.maxXmlAttributes;
    assert.equal((await parseExport(workbook([row({ inr: cell(limit - 1) })]))).rows.length, 1);
    await assertRejected(workbook([row({ inr: cell(limit) })]), "BAD_STRUCTURE");
    const top = (partsHolding("")[SHEET] as string).replace("<worksheet", `<worksheet ${attributeList(limit)}`);
    await assertRejected(workbook([row()], { overrides: { [SHEET]: top } }), "BAD_STRUCTURE");
  });

  it("the count starts again on each element, and closed elements stop counting towards depth", async () => {
    const half = `<a ${attributeList(40)}/>`;
    const siblings = nested(deepest).repeat(3);
    const overrides = { [SHEET]: partsHolding(`${half}${half}${siblings}`)[SHEET] as string };
    assert.equal((await parseExport(workbook([row()], { overrides }))).rows.length, 1);
  });

  it("the limits come from the settings, so they can be tested exactly", async () => {
    // A plain file goes five levels deep (down to a cell's value), and its shared strings have three attributes.
    const plain = workbook();
    assert.equal((await parseExport(plain, { ...LIMITS, maxXmlDepth: 5 })).rows.length, 1);
    await assertRejected(plain, "BAD_STRUCTURE", { ...LIMITS, maxXmlDepth: 4 });
    assert.equal((await parseExport(plain, { ...LIMITS, maxXmlAttributes: 3 })).rows.length, 1);
    await assertRejected(plain, "BAD_STRUCTURE", { ...LIMITS, maxXmlAttributes: 2 });
  });

  it("a huge, deep file stops at once, with no crash", async () => {
    const xml = `<?xml version="1.0"?><worksheet>${"<a>".repeat(20_000_000)}`;
    for (const part of [SHEET, TYPES]) {
      const file = workbook([row()], { overrides: { [part]: xml } });
      assert.ok(file.length < MB, "the file must be small when packed");
      const stats = { bytesUnpacked: 0 };
      const started = performance.now();
      await assertRejected(file, "BAD_STRUCTURE", undefined, stats);
      assert.ok(performance.now() - started < 5000, "it must stop quickly");
      assert.ok(stats.bytesUnpacked < MB, "reading must stop long before the end of the part");
    }
  });

  it("an element with a huge number of attributes stops as they arrive", async () => {
    const xml = `<?xml version="1.0"?><worksheet ${attributeList(1_000_000)}><sheetData/></worksheet>`;
    const file = workbook([row()], { overrides: { [SHEET]: xml } });
    const stats = { bytesUnpacked: 0 };
    const started = performance.now();
    await assertRejected(file, "BAD_STRUCTURE", undefined, stats);
    assert.ok(performance.now() - started < 5000, "it must stop quickly");
    assert.ok(stats.bytesUnpacked < MB, "reading must stop long before the end of the tag");
  });
});

describe("S-2: only known elements from sheetData inwards", () => {
  const xmlns = 'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  const data = (inner: string) => workbook([], { overrides: sheetWithHeader(inner) });
  const goodRow = '<row r="3"><c r="A3"><v>1</v></c></row>';
  const afterData = (after: string) => {
    const sheet = sheetXml([HEADER, row()], new Map()).replace("</sheetData>", `</sheetData>${after}`);
    return workbook([row()], { overrides: { [SHEET]: sheet } });
  };
  const beforeData = (before: string) => workbook([row()], { overrides: { [SHEET]: partsHolding(before)[SHEET] as string } });
  const inlineNote = (inner: string) => workbook([row({ note: { attributes: 't="inlineStr"', inner } })]);

  it("table row 1: a prefixed formula in an amount is refused", async () => {
    const inr = { inner: `<x:f ${xmlns}>SUM(Z1:Z9)</x:f><v>99</v>` };
    await assertRejected(workbook([row({ inr })]), "BAD_STRUCTURE");
  });

  it("table row 2: a prefixed row inside sheetData is refused", async () => {
    await assertRejected(data(`<x:row ${xmlns} r="3"><x:c r="A3"><x:v>1</x:v></x:c></x:row>`), "BAD_STRUCTURE");
  });

  it("table row 3: an unknown row inside sheetData is refused", async () => {
    await assertRejected(data('<rowz r="3"><cz r="A3"><v>1</v></cz></rowz>'), "BAD_STRUCTURE");
  });

  it("table row 4: a row after sheetData is refused, bare or wrapped", async () => {
    await assertRejected(afterData(goodRow), "BAD_STRUCTURE");
    await assertRejected(afterData(`<a>${goodRow}</a>`), "BAD_STRUCTURE");
    await assertRejected(afterData(`<a><b>${goodRow}</b></a>`), "BAD_STRUCTURE");
    await assertRejected(afterData(`<extLst><ext>${goodRow}</ext></extLst>`), "BAD_STRUCTURE");
    await assertRejected(afterData(`<x:row ${xmlns} r="3"/>`), "BAD_STRUCTURE");
  });

  it("table row 5: a prefixed value in a text cell is refused", async () => {
    const note = { attributes: 't="str"', inner: `<x:v ${xmlns}>Made-up</x:v>` };
    await assertRejected(workbook([row({ note })]), "BAD_STRUCTURE");
  });

  it("table row 6: a prefixed second sheet counts as a sheet", async () => {
    const xml =
      `<?xml version="1.0"?><workbook xmlns:r="x" ${xmlns}><sheets><sheet r:id="rId1"/>` +
      '<x:sheet r:id="rId2"/></sheets></workbook>';
    await assertRejected(workbook([row()], { overrides: { [WORKBOOK]: xml } }), "NOT_ONE_SHEET");
  });

  it("a row or cell is refused before sheetData too, and a prefixed sheetData anywhere", async () => {
    await assertRejected(beforeData(goodRow), "BAD_STRUCTURE");
    await assertRejected(beforeData(`<a>${goodRow}</a>`), "BAD_STRUCTURE");
    await assertRejected(beforeData('<c r="A3"><v>1</v></c>'), "BAD_STRUCTURE");
    await assertRejected(afterData('<a><c r="A3"><v>1</v></c></a>'), "BAD_STRUCTURE");
    await assertRejected(afterData(`<x:sheetData ${xmlns}>${goodRow}</x:sheetData>`), "BAD_STRUCTURE");
  });

  it("N-1: inline text nesting is checked in the same place", async () => {
    await assertRejected(inlineNote("<is><is><t>Made-up</t></is></is>"), "BAD_STRUCTURE");
    await assertRejected(inlineNote("<is><r><r><t>Made-up</t></r></r></is>"), "BAD_STRUCTURE");
    await assertRejected(inlineNote("<is><t><t>Made-up</t></t></is>"), "BAD_STRUCTURE");
    await assertRejected(inlineNote("<t>Made-up</t>"), "BAD_STRUCTURE");
    await assertRejected(inlineNote("<r><t>Made-up</t></r>"), "BAD_STRUCTURE");
  });

  it("refuses elements in the wrong place, even with a known name", async () => {
    await assertRejected(data('<c r="A2"><v>1</v></c>'), "BAD_STRUCTURE");
    await assertRejected(data('<row r="2"><v>1</v></row>'), "BAD_STRUCTURE");
    await assertRejected(data('<row r="2"><c r="A2"><v>1<b/></v></c></row>'), "BAD_STRUCTURE");
    await assertRejected(data('<row r="2"><c r="A2"><f><v>1</v></f></c></row>'), "BAD_STRUCTURE");
    await assertRejected(data("<extLst/>"), "BAD_STRUCTURE");
    await assertRejected(inlineNote("<is><rPr/><t>Made-up</t></is>"), "BAD_STRUCTURE");
    await assertRejected(inlineNote("<is><r><rPr><made-up/></rPr><t>Made-up</t></r></is>"), "BAD_STRUCTURE");
    await assertRejected(inlineNote("<is><rPh><b/></rPh><t>Made-up</t></is>"), "BAD_STRUCTURE");
    await assertRejected(data("<__proto__/>"), "BAD_STRUCTURE");
  });

  it("nothing that holds data can hide inside extLst", async () => {
    const hidden = (inside: string) => ({ inner: `<v>100.5</v><extLst><ext>${inside}</ext></extLst>` });
    for (const inside of [goodRow, '<c r="B3"/>', "<f>SUM(Z1:Z9)</f>", "<v>99</v>", "<t>x</t>", "<is/>", `<x:f ${xmlns}>1</x:f>`]) {
      await assertRejected(workbook([row({ inr: hidden(inside) })]), "BAD_STRUCTURE");
    }
    await assertRejected(data(`<row r="2"><extLst><ext><a>${goodRow}</a></ext></extLst></row>`), "BAD_STRUCTURE");
  });

  it("keeps what Excel normally writes", async () => {
    const properties =
      '<rPr><rFont val="Made-up"/><charset val="1"/><family val="2"/><b/><i/><strike/><outline/><shadow/>' +
      '<condense/><extend/><color rgb="FF000000"/><sz val="11"/><u/><vertAlign val="baseline"/><scheme val="minor"/></rPr>';
    const note = {
      attributes: 't="inlineStr" s="1"',
      inner:
        `<is><r>${properties}<t xml:space="preserve">Made-up </t></r><r><t>note</t></r>` +
        '<rPh sb="0" eb="1"><t>phonetic</t></rPh><phoneticPr fontId="1"/></is>' +
        '<extLst><ext uri="{made-up}" xmlns:y="made-up"><y:any><y:thing/></y:any></ext></extLst>',
    };
    const inr = { attributes: 's="2"', inner: '<v>100.5</v><extLst><ext uri="{made-up}"/></extLst>' };
    const { rows } = await parseExport(workbook([row({ note, inr })]));
    assert.equal(rows[0]?.note, "Made-up note");
    assert.equal(rows[0]?.amountPaise, 100_50);

    const extras = '<row r="3" spans="1:12" ht="15" x14ac:dyDescent="0.25" xmlns:x14ac="made-up"><extLst><ext/></extLst></row>';
    const emptyRow = workbook([], { overrides: sheetWithHeader(extras) });
    await assertRejected(emptyRow, "EMPTY_FILE");
  });

  it("leaves the rest of the sheet alone", async () => {
    const before = '<sheetPr/><dimension ref="A1:L2"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><cols><col min="1" max="1"/></cols>';
    const after = '<mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells><pageMargins left="1"/>' +
      '<extLst><ext uri="{made-up}" xmlns:xm="made-up"><xm:f>Made-up!A1</xm:f></ext></extLst>';
    const sheet = sheetXml([HEADER, row()], new Map())
      .replace("<sheetData>", `${before}<sheetData>`)
      .replace("</sheetData>", `</sheetData>${after}`);
    assert.equal((await parseExport(workbook([row()], { overrides: { [SHEET]: sheet } }))).rows.length, 1);
  });

  it("a single prefixed sheet is still one sheet", async () => {
    const xml = `<?xml version="1.0"?><x:workbook xmlns:r="x" ${xmlns}><x:sheets><x:sheet r:id="rId1"/></x:sheets></x:workbook>`;
    assert.equal((await parseExport(workbook([row()], { overrides: { [WORKBOOK]: xml } }))).rows.length, 1);
  });
});

describe("S-5: only known elements in shared strings, and a prefixed workbookPr", () => {
  /** A header, one good row, then a row whose chosen cell points at the first string added. */
  const withAdded = (added: string, field: "type" | "account" | "note" = "type") => {
    const strings = new Map<string, number>();
    sheetXml([HEADER, row()], strings);
    const pointing = row({ [field]: { attributes: 't="s"', inner: `<v>${strings.size}</v>` } });
    const sheet = sheetXml([HEADER, row(), pointing], strings);
    const shared = sharedStringsXml(strings).replace("</sst>", `${added}</sst>`);
    return workbook([row(), pointing], { overrides: { [SHEET]: sheet, [SHARED]: shared } });
  };

  it("table row 1: a prefixed item can't shift the type to Transfer-In", async () => {
    await assertRejected(withAdded("<x:si><t>Exp.</t></x:si><si><t>Transfer-In</t></si>"), "BAD_STRUCTURE");
  });

  it("table row 2: a prefixed item can't shift the type to Income", async () => {
    await assertRejected(withAdded("<x:si><t>Exp.</t></x:si><si><t>Income</t></si>"), "BAD_STRUCTURE");
  });

  it("table row 3: a prefixed item can't shift the account", async () => {
    const added = "<x:si><t>Account One</t></x:si><si><t>Account Two</t></si>";
    await assertRejected(withAdded(added, "account"), "BAD_STRUCTURE");
  });

  it("table row 4: prefixed text can't blank a note", async () => {
    await assertRejected(withAdded("<si><x:t>Real note</x:t></si>", "note"), "BAD_STRUCTURE");
  });

  it("table row 5: prefixed text can't be dropped from the front of a value", async () => {
    await assertRejected(withAdded("<si><x:t>Exp.</x:t><t>Income</t></si>"), "BAD_STRUCTURE");
  });

  it("table row 6: phonetic text behind a prefix can't join the value", async () => {
    const added = '<si><t>Transfer-</t><x:rPh sb="0" eb="1"><t>In</t></x:rPh></si>';
    await assertRejected(withAdded(added), "BAD_STRUCTURE");
  });

  it("an unknown item can't shift the strings", async () => {
    await assertRejected(withAdded("<siz><t>Exp.</t></siz><si><t>Income</t></si>"), "BAD_STRUCTURE");
  });

  it("text can't sit inside an unknown wrapper", async () => {
    await assertRejected(withAdded("<si><foo><t>Income</t></foo></si>"), "BAD_STRUCTURE");
  });

  it("refuses known names in the wrong place, and a second top element", async () => {
    for (const added of [
      "<t>Income</t>", "<si><si><t>Income</t></si></si>", "<si><t><b/>Income</t></si>",
      "<si><r><r><t>Income</t></r></r></si>", "<si><rPh><r><t>Income</t></r></rPh></si>",
      "<si><extLst/><t>Income</t></si>",
    ]) {
      await assertRejected(withAdded(added), "BAD_STRUCTURE");
    }
    await assertRejected(withAdded("</sst><sst><si><t>Income</t></si>"), "BAD_STRUCTURE");
  });

  it("no string can hide inside extLst, prefixed or not", async () => {
    for (const hidden of ["<si><t>Income</t></si>", "<x:si/>", "<t>Income</t>", "<x:t>Income</x:t>", "<y:any><x:si/></y:any>"]) {
      await assertRejected(withAdded(`<extLst><ext uri="{made-up}">${hidden}</ext></extLst>`), "BAD_STRUCTURE");
    }
  });

  it("keeps rich text, phonetic text and an extLst", async () => {
    const added =
      '<si><r><rPr><b/><sz val="11"/><rFont val="Made-up"/></rPr><t xml:space="preserve">Made-up </t></r>' +
      '<r><t>rich note</t></r><rPh sb="0" eb="1"><t>phonetic</t></rPh><phoneticPr fontId="1"/></si>' +
      '<extLst><ext uri="{made-up}" xmlns:y="made-up"><y:any><y:thing/></y:any></ext></extLst>';
    const { rows } = await parseExport(withAdded(added, "note"));
    assert.equal(rows[1]?.note, "Made-up rich note");
    assert.equal(rows[0]?.note, "Made-up note");
  });

  it("a prefixed workbookPr still sets the 1904 dates", async () => {
    const xmlns = 'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
    const xml =
      `<?xml version="1.0"?><x:workbook xmlns:r="x" ${xmlns}><x:workbookPr date1904="1"/>` +
      '<x:sheets><x:sheet r:id="rId1"/></x:sheets></x:workbook>';
    const { rows } = await parseExport(workbook([row({ period: 45000 })], { overrides: { [WORKBOOK]: xml } }));
    assert.match(rows[0]?.occurredAt ?? "", /^2027-03-16/);
  });
});
