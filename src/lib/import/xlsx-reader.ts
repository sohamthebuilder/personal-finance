import { crc32 } from "node:zlib";
import sax, { type Parser } from "sax";
import yauzl, { type Entry, type ZipFile } from "yauzl";
import { ImportRejected } from "./errors.ts";

/**
 * A small .xlsx reader (D-019). It takes bytes, streams only the parts it needs,
 * and stops on anything it doesn't recognise. The checks run in the order set
 * out in docs/phases/phase-1/security.md, section 2.
 */

const MB = 1024 * 1024;

export const LIMITS = {
  maxFileBytes: 20 * MB,
  maxUnpackedBytes: 200 * MB,
  maxDataRows: 100_000,
  maxZipEntries: 100,
  maxColumns: 12,
  maxCellChars: 32_767,
  maxTotalCellChars: 200 * MB,
  maxXmlDepth: 64,
  maxXmlAttributes: 64,
} as const;

export type Limits = { [K in keyof typeof LIMITS]: number };

/** Security conditions depend on these. A test fails if they change. */
export const ZIP_OPTIONS = {
  lazyEntries: true,
  decodeStrings: true,
  validateEntrySizes: true,
  strictFileNames: true,
} as const;

export const XML_OPTIONS = {
  trim: false,
  normalize: false,
  strictEntities: true,
  unparsedEntities: false,
} as const;

export interface Cell {
  kind: "text" | "number";
  text: string;
  formula: boolean;
}

export interface ReadStats {
  /** Real bytes unpacked so far, across every part. */
  bytesUnpacked: number;
}

export type RowHandler = (rowNumber: number, cells: ReadonlyArray<Cell | null>) => void;

const WORKBOOK_PART = "xl/workbook.xml";
const WORKBOOK_LINKS_PART = "xl/_rels/workbook.xml.rels";
const CONTENT_TYPES_PART = "[Content_Types].xml";
const SHARED_STRINGS_PART = "xl/sharedStrings.xml";
const SHEET_PART = /^xl\/worksheets\/[A-Za-z0-9_]+\.xml$/;
const CELL_REFERENCE = /^([A-Z]{1,3})([1-9][0-9]{0,6})$/;
const WHOLE_NUMBER = /^[1-9][0-9]{0,6}$/;
const SHARED_INDEX = /^(0|[1-9][0-9]{0,8})$/;
const ZIP_START = [0x50, 0x4b, 0x03, 0x04];
const OLD_OFFICE_START = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const STORED = 0;
const DEFLATED = 8;

const RICH_TEXT = ["t", "r", "rPh", "phoneticPr"];
const TEXT_PROPERTIES = [
  "rFont", "charset", "family", "b", "i", "strike", "outline", "shadow",
  "condense", "extend", "color", "sz", "u", "vertAlign", "scheme",
];

/**
 * What each element may hold, from sheetData inwards. Anything else is refused,
 * and an element that isn't listed here (such as `v`) may hold no elements at all.
 */
const SHEET_ELEMENTS = new Map<string, ReadonlySet<string>>([
  ["sheetData", new Set(["row"])],
  ["row", new Set(["c", "extLst"])],
  ["c", new Set(["f", "v", "is", "extLst"])],
  ["is", new Set(RICH_TEXT)],
  ["r", new Set(["rPr", "t"])],
  ["rPr", new Set(TEXT_PROPERTIES)],
  ["rPh", new Set(["t"])],
]);

/** Refused outside sheetData, with or without a prefix, so no row can be lost there. */
const ROW_ELEMENTS = new Set(["sheetData", "row", "c"]);

/** Extension content is skipped, so nothing that holds data may be inside it. */
const DATA_ELEMENTS = new Set([...ROW_ELEMENTS, "f", "v", "is", "t"]);

/**
 * What each element may hold in shared strings, by the same rule as the sheet.
 * The empty name is the top of the part. `r`, `rPr` and `rPh` come from the sheet's list.
 */
const SHARED_STRING_ELEMENTS = new Map<string, ReadonlySet<string>>([
  ...SHEET_ELEMENTS,
  ["", new Set(["sst"])],
  ["sst", new Set(["si", "extLst"])],
  ["si", new Set(RICH_TEXT)],
]);

/** Extension content in shared strings is skipped, so no string may be inside it. */
const SHARED_STRING_DATA = new Set(["si", "t"]);

function startsWith(bytes: Uint8Array, start: readonly number[]): boolean {
  return start.every((value, index) => bytes[index] === value);
}

function openZip(bytes: Buffer): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(bytes, ZIP_OPTIONS, (error, zip) => (error ? reject(error) : resolve(zip)));
  });
}

/** Step 3: looks at the zip's directory only. Nothing is unpacked here. */
function readDirectory(zip: ZipFile, limits: Limits): Promise<Map<string, Entry>> {
  return new Promise((resolve, reject) => {
    if (zip.entryCount > limits.maxZipEntries) {
      reject(new ImportRejected("TOO_MANY_ENTRIES"));
      return;
    }
    const entries = new Map<string, Entry>();
    const seen = new Set<string>();
    let declaredBytes = 0;

    zip.on("error", reject);
    zip.on("end", () => resolve(entries));
    zip.on("entry", (entry: Entry) => {
      try {
        const name = entry.fileName.toLowerCase();
        if (seen.has(name)) throw new ImportRejected("BAD_STRUCTURE");
        seen.add(name);
        if (seen.size > limits.maxZipEntries) throw new ImportRejected("TOO_MANY_ENTRIES");
        if (entry.isEncrypted()) throw new ImportRejected("PROTECTED_OR_OLD_FILE");
        if (entry.compressionMethod !== STORED && entry.compressionMethod !== DEFLATED) {
          throw new ImportRejected("BAD_STRUCTURE");
        }
        if (name === "xl/vbaproject.bin") throw new ImportRejected("MACRO_FILE");
        if (name.startsWith("xl/externallinks/")) throw new ImportRejected("EXTERNAL_LINK");
        declaredBytes += entry.uncompressedSize;
        if (declaredBytes > limits.maxUnpackedBytes) throw new ImportRejected("UNPACKED_TOO_LARGE");
        entries.set(entry.fileName, entry);
        zip.readEntry();
      } catch (error) {
        reject(error);
      }
    });
    zip.readEntry();
  });
}

function openPart(zip: ZipFile, entry: Entry): Promise<NodeJS.ReadableStream> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => (error ? reject(error) : resolve(stream)));
  });
}

function xmlParser(limits: Limits): Parser {
  const parser = sax.parser(true, XML_OPTIONS);
  let attributes = 0;
  // These two run as each tag and attribute arrives, so memory can't grow first.
  parser.onopentagstart = () => {
    if (parser.tags.length >= limits.maxXmlDepth) throw new ImportRejected("BAD_STRUCTURE");
    attributes = 0;
  };
  parser.onattribute = () => {
    attributes += 1;
    if (attributes > limits.maxXmlAttributes) throw new ImportRejected("BAD_STRUCTURE");
  };
  parser.onerror = () => {
    throw new ImportRejected("DAMAGED_FILE");
  };
  parser.ondoctype = () => {
    throw new ImportRejected("UNSAFE_XML");
  };
  parser.onprocessinginstruction = ({ name, body }) => {
    const encoding = /encoding\s*=\s*["']([^"']*)["']/.exec(body);
    if (name === "xml" && encoding && encoding[1]?.toLowerCase() !== "utf-8") {
      throw new ImportRejected("UNSAFE_XML");
    }
  };
  return parser;
}

/** Counts real bytes across every part. A second layer behind the zip reader's own size check. */
export function countUnpacked(bytes: number, stats: ReadStats, limits: Limits): void {
  stats.bytesUnpacked += bytes;
  if (stats.bytesUnpacked > limits.maxUnpackedBytes) throw new ImportRejected("UNPACKED_TOO_LARGE");
}

/** Steps 5 and 6: unpacks one part as a stream into the parser, counting real bytes. */
async function streamPart(
  zip: ZipFile,
  entry: Entry,
  parser: Parser,
  stats: ReadStats,
  limits: Limits,
): Promise<void> {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let checksum = 0;
  for await (const chunk of await openPart(zip, entry)) {
    const bytes = chunk as Buffer;
    countUnpacked(bytes.length, stats, limits);
    checksum = crc32(bytes, checksum);
    parser.write(decoder.decode(bytes, { stream: true }));
  }
  parser.write(decoder.decode());
  parser.close();
  if (checksum !== entry.crc32) throw new ImportRejected("DAMAGED_FILE");
}

/** An element's name without any prefix, so `x:row` gives `row`. */
function localName(name: string): string {
  return name.slice(name.lastIndexOf(":") + 1);
}

function requiredPart(entries: Map<string, Entry>, name: string): Entry {
  const entry = entries.get(name);
  if (!entry) throw new ImportRejected("NOT_EXCEL");
  return entry;
}

async function checkContentTypes(
  zip: ZipFile,
  entries: Map<string, Entry>,
  stats: ReadStats,
  limits: Limits,
): Promise<void> {
  const parser = xmlParser(limits);
  parser.onopentag = ({ attributes }) => {
    if ((attributes.ContentType ?? "").toLowerCase().includes("macroenabled")) {
      throw new ImportRejected("MACRO_FILE");
    }
  };
  await streamPart(zip, requiredPart(entries, CONTENT_TYPES_PART), parser, stats, limits);
}

interface Workbook {
  sheetLinkId: string;
  uses1904Dates: boolean;
}

async function readWorkbook(
  zip: ZipFile,
  entries: Map<string, Entry>,
  stats: ReadStats,
  limits: Limits,
): Promise<Workbook> {
  const links: string[] = [];
  let sheets = 0;
  let uses1904Dates = false;
  const parser = xmlParser(limits);
  parser.onopentag = ({ name, attributes }) => {
    if (localName(name) === "sheet") {
      sheets += 1;
      if (attributes["r:id"]) links.push(attributes["r:id"]);
    } else if (localName(name) === "workbookPr") {
      uses1904Dates = attributes.date1904 === "1" || attributes.date1904 === "true";
    }
  };
  await streamPart(zip, requiredPart(entries, WORKBOOK_PART), parser, stats, limits);
  if (sheets !== 1) throw new ImportRejected("NOT_ONE_SHEET");
  if (links.length !== 1) throw new ImportRejected("BAD_STRUCTURE");
  return { sheetLinkId: links[0] as string, uses1904Dates };
}

function linkedPartName(target: string): string {
  return target.startsWith("/") ? target.slice(1) : `xl/${target}`;
}

interface Parts {
  sheet: string;
  sharedStrings: string | null;
}

async function readWorkbookLinks(
  zip: ZipFile,
  entries: Map<string, Entry>,
  sheetLinkId: string,
  stats: ReadStats,
  limits: Limits,
): Promise<Parts> {
  let sheet: string | null = null;
  let sharedStrings: string | null = null;
  const parser = xmlParser(limits);
  parser.onopentag = ({ name, attributes }) => {
    if (name !== "Relationship") return;
    if (attributes.TargetMode === "External") throw new ImportRejected("EXTERNAL_LINK");
    const target = linkedPartName(attributes.Target ?? "");
    if (attributes.Id === sheetLinkId) sheet = target;
    else if ((attributes.Type ?? "").endsWith("/sharedStrings")) sharedStrings = target;
  };
  await streamPart(zip, requiredPart(entries, WORKBOOK_LINKS_PART), parser, stats, limits);
  // Link targets are only ever compared with fixed names, never used as paths.
  if (sheet === null || !SHEET_PART.test(sheet)) throw new ImportRejected("BAD_STRUCTURE");
  if (sharedStrings !== null && sharedStrings !== SHARED_STRINGS_PART) throw new ImportRejected("BAD_STRUCTURE");
  return { sheet, sharedStrings };
}

/** Collects text up to the cell limit, so one huge cell can't fill memory. */
class TextCollector {
  private text = "";
  private readonly limit: number;

  constructor(limit: number) {
    this.limit = limit;
  }

  add(piece: string): void {
    if (this.text.length + piece.length > this.limit) throw new ImportRejected("CELL_TOO_LONG");
    this.text += piece;
  }

  take(): string {
    const text = this.text;
    this.text = "";
    return text;
  }
}

async function readSharedStrings(
  zip: ZipFile,
  entry: Entry,
  stats: ReadStats,
  limits: Limits,
): Promise<string[]> {
  const strings: string[] = [];
  const collector = new TextCollector(limits.maxCellChars);
  const path: string[] = [];
  let extensionDepth = 0;
  let finished = false;
  const parser = xmlParser(limits);
  const onText = (text: string) => {
    if (path.at(-1) === "t" && path.at(-2) !== "rPh") collector.add(text);
  };
  parser.ontext = onText;
  parser.oncdata = onText;
  parser.onopentag = ({ name }) => {
    if (extensionDepth > 0) {
      if (SHARED_STRING_DATA.has(localName(name))) throw new ImportRejected("BAD_STRUCTURE");
      extensionDepth += 1;
      return;
    }
    if (finished) throw new ImportRejected("BAD_STRUCTURE");
    if (!SHARED_STRING_ELEMENTS.get(path.at(-1) ?? "")?.has(name)) throw new ImportRejected("BAD_STRUCTURE");
    if (name === "extLst") {
      extensionDepth = 1;
      return;
    }
    path.push(name);
  };
  parser.onclosetag = () => {
    if (extensionDepth > 0) {
      extensionDepth -= 1;
      return;
    }
    if (path.pop() === "si") strings.push(collector.take());
    finished = path.length === 0;
  };
  await streamPart(zip, entry, parser, stats, limits);
  return strings;
}

function columnNumber(letters: string): number {
  let column = 0;
  for (const letter of letters) column = column * 26 + (letter.charCodeAt(0) - 64);
  return column;
}

interface OpenCell {
  column: number;
  type: string | undefined;
  value: string | null;
  inline: string | null;
  formula: boolean;
}

async function readSheet(
  zip: ZipFile,
  entry: Entry,
  shared: readonly string[],
  onRow: RowHandler,
  stats: ReadStats,
  limits: Limits,
): Promise<void> {
  const collector = new TextCollector(limits.maxCellChars);
  let sheetDataBlocks = 0;
  let inSheetData = false;
  let rowsSeen = 0;
  let lastRow = 0;
  let totalChars = 0;
  let row: Array<Cell | null> | null = null;
  let rowNumber = 0;
  let lastColumn = 0;
  let cell: OpenCell | null = null;
  let capture: "value" | "inline" | null = null;
  let inPhonetic = false;
  /** The open elements, from sheetData inwards. */
  const path: string[] = [];
  /** How many elements are open inside an extLst, counting the extLst. */
  let extensionDepth = 0;

  function finishCell(open: OpenCell): Cell | null {
    let text: string | null;
    let kind: Cell["kind"] = "text";
    switch (open.type) {
      case undefined:
      case "n":
        text = open.value;
        kind = "number";
        break;
      case "s": {
        if (open.value === null || !SHARED_INDEX.test(open.value)) throw new ImportRejected("BAD_STRUCTURE");
        const index = Number(open.value);
        if (index >= shared.length) throw new ImportRejected("BAD_STRUCTURE");
        text = shared[index] ?? null;
        break;
      }
      case "str":
        text = open.value;
        break;
      case "inlineStr":
        text = open.inline;
        break;
      default:
        throw new ImportRejected("UNSUPPORTED_CELL");
    }
    // A cell holds one kind of value. Anything else would quietly lose part of it.
    const isInline = open.type === "inlineStr";
    if (isInline ? open.value !== null : open.inline !== null) throw new ImportRejected("BAD_STRUCTURE");
    if (text === null && !open.formula) return null;
    const value = text ?? "";
    totalChars += value.length;
    if (totalChars > limits.maxTotalCellChars) throw new ImportRejected("TOO_MUCH_TEXT");
    return { kind, text: value, formula: open.formula };
  }

  const parser = xmlParser(limits);
  const onText = (text: string) => {
    if (capture !== null && !inPhonetic) collector.add(text);
  };
  parser.ontext = onText;
  parser.oncdata = onText;
  parser.onopentag = ({ name, attributes }) => {
    if (extensionDepth > 0) {
      if (DATA_ELEMENTS.has(localName(name))) throw new ImportRejected("BAD_STRUCTURE");
      extensionDepth += 1;
      return;
    }
    if (name === "sheetData") {
      sheetDataBlocks += 1;
      if (sheetDataBlocks > 1) throw new ImportRejected("BAD_STRUCTURE");
      inSheetData = true;
      path.push(name);
      return;
    }
    if (!inSheetData) {
      if (ROW_ELEMENTS.has(localName(name))) throw new ImportRejected("BAD_STRUCTURE");
      return;
    }
    if (!SHEET_ELEMENTS.get(path.at(-1) ?? "")?.has(name)) throw new ImportRejected("BAD_STRUCTURE");
    if (name === "extLst") {
      extensionDepth = 1;
      return;
    }
    path.push(name);
    if (name === "row") {
      if (row !== null) throw new ImportRejected("BAD_STRUCTURE");
      const reference = attributes.r;
      if (reference === undefined || !WHOLE_NUMBER.test(reference)) throw new ImportRejected("BAD_STRUCTURE");
      rowNumber = Number(reference);
      if (rowNumber <= lastRow) throw new ImportRejected("BAD_STRUCTURE");
      lastRow = rowNumber;
      rowsSeen += 1;
      // The header doesn't count, and empty rows do.
      if (rowsSeen - 1 > limits.maxDataRows) throw new ImportRejected("TOO_MANY_ROWS");
      row = new Array<Cell | null>(limits.maxColumns).fill(null);
      lastColumn = 0;
    } else if (name === "c") {
      const match = CELL_REFERENCE.exec(attributes.r ?? "");
      if (row === null || cell !== null || match === null || Number(match[2]) !== rowNumber) {
        throw new ImportRejected("BAD_STRUCTURE");
      }
      const column = columnNumber(match[1] ?? "");
      if (column > limits.maxColumns) throw new ImportRejected("TOO_MANY_COLUMNS");
      if (column <= lastColumn) throw new ImportRejected("BAD_STRUCTURE");
      lastColumn = column;
      cell = { column, type: attributes.t, value: null, inline: null, formula: false };
    } else if (cell !== null) {
      if (name === "f") {
        cell.formula = true;
      } else if (name === "v") {
        if (capture !== null || cell.value !== null) throw new ImportRejected("BAD_STRUCTURE");
        capture = "value";
      } else if (name === "rPh") {
        inPhonetic = true;
      } else if (name === "t") {
        if (capture !== null) throw new ImportRejected("BAD_STRUCTURE");
        capture = "inline";
      }
    }
  };
  parser.onclosetag = (name) => {
    if (extensionDepth > 0) {
      extensionDepth -= 1;
      return;
    }
    if (inSheetData) path.pop();
    if (name === "sheetData") {
      inSheetData = false;
    } else if (name === "rPh") {
      inPhonetic = false;
    } else if (name === "v" && cell !== null) {
      cell.value = collector.take();
      capture = null;
    } else if (name === "t" && cell !== null) {
      // Rich text comes in pieces, and the limit is on the whole cell.
      cell.inline = (cell.inline ?? "") + collector.take();
      if (cell.inline.length > limits.maxCellChars) throw new ImportRejected("CELL_TOO_LONG");
      capture = null;
    } else if (name === "c" && cell !== null && row !== null) {
      row[cell.column - 1] = finishCell(cell);
      cell = null;
    } else if (name === "row" && row !== null) {
      onRow(rowNumber, row);
      row = null;
    }
  };
  await streamPart(zip, entry, parser, stats, limits);
  if (sheetDataBlocks !== 1) throw new ImportRejected("BAD_STRUCTURE");
}

export interface ReadResult {
  uses1904Dates: boolean;
}

/**
 * Reads the only sheet and passes each row to `onRow`. Throws ImportRejected
 * with a fixed code, and never anything that holds text from the file.
 */
export async function readXlsx(
  bytes: Uint8Array,
  onRow: RowHandler,
  limits: Limits = LIMITS,
  stats: ReadStats = { bytesUnpacked: 0 },
): Promise<ReadResult> {
  if (bytes.length === 0) throw new ImportRejected("EMPTY_FILE");
  if (bytes.length > limits.maxFileBytes) throw new ImportRejected("FILE_TOO_LARGE");
  if (startsWith(bytes, OLD_OFFICE_START)) throw new ImportRejected("PROTECTED_OR_OLD_FILE");
  if (!startsWith(bytes, ZIP_START)) throw new ImportRejected("NOT_EXCEL");

  let zip: ZipFile | null = null;
  try {
    zip = await openZip(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length));
    const entries = await readDirectory(zip, limits);
    await checkContentTypes(zip, entries, stats, limits);
    const workbook = await readWorkbook(zip, entries, stats, limits);
    const parts = await readWorkbookLinks(zip, entries, workbook.sheetLinkId, stats, limits);
    const shared =
      parts.sharedStrings === null
        ? []
        : await readSharedStrings(zip, requiredPart(entries, parts.sharedStrings), stats, limits);
    await readSheet(zip, requiredPart(entries, parts.sheet), shared, onRow, stats, limits);
    return { uses1904Dates: workbook.uses1904Dates };
  } catch (error) {
    if (error instanceof ImportRejected) throw error;
    // Zip, inflate and XML errors can quote the file, so their text is dropped.
    throw new ImportRejected("DAMAGED_FILE");
  } finally {
    zip?.close();
  }
}
