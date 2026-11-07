import { crc32, deflateRawSync } from "node:zlib";

/**
 * Builds .xlsx bytes in memory for the sample and for hostile test files.
 * It never touches the disk, and the same input always gives the same bytes.
 */

export interface ZipPart {
  name: string;
  data: Uint8Array | string;
  /** Leave uncompressed. Also used to reach an exact file size. */
  store?: boolean;
  /** Claim a different unpacked size in the zip's headers. */
  declaredSize?: number;
  /** Claim a different compression method in the zip's headers. */
  method?: number;
  /** Set the zip's "encrypted" flag. */
  encrypted?: boolean;
  /** Extra directory entries that point at this part's data under other names. */
  aliases?: string[];
}

const FIXED_DOS_TIME = 0;
const FIXED_DOS_DATE = (2026 - 1980) * 512 + 1 * 32 + 1;

function header(signature: number, size: number): Buffer {
  const buffer = Buffer.alloc(size);
  buffer.writeUInt32LE(signature, 0);
  return buffer;
}

export function buildZip(parts: readonly ZipPart[]): Uint8Array {
  const chunks: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  let directoryEntries = 0;

  for (const part of parts) {
    const raw = typeof part.data === "string" ? Buffer.from(part.data, "utf8") : Buffer.from(part.data);
    const packed = part.store ? raw : deflateRawSync(raw, { level: 9 });
    const method = part.method ?? (part.store ? 0 : 8);
    const flags = (part.encrypted ? 1 : 0) | 0x0800;
    const checksum = crc32(raw);
    const unpackedSize = part.declaredSize ?? raw.length;
    const name = Buffer.from(part.name, "utf8");

    const local = header(0x04034b50, 30);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(FIXED_DOS_TIME, 10);
    local.writeUInt16LE(FIXED_DOS_DATE, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(unpackedSize, 22);
    local.writeUInt16LE(name.length, 26);
    chunks.push(local, name, packed);

    for (const entryName of [part.name, ...(part.aliases ?? [])]) {
      const entryNameBytes = Buffer.from(entryName, "utf8");
      const central = header(0x02014b50, 46);
      central.writeUInt16LE(20, 4);
      central.writeUInt16LE(20, 6);
      central.writeUInt16LE(flags, 8);
      central.writeUInt16LE(method, 10);
      central.writeUInt16LE(FIXED_DOS_TIME, 12);
      central.writeUInt16LE(FIXED_DOS_DATE, 14);
      central.writeUInt32LE(checksum, 16);
      central.writeUInt32LE(packed.length, 20);
      central.writeUInt32LE(unpackedSize, 24);
      central.writeUInt16LE(entryNameBytes.length, 28);
      central.writeUInt32LE(offset, 42);
      directory.push(central, entryNameBytes);
      directoryEntries += 1;
    }
    offset += local.length + name.length + packed.length;
  }

  const directoryBytes = Buffer.concat(directory);
  const end = header(0x06054b50, 22);
  end.writeUInt16LE(directoryEntries, 8);
  end.writeUInt16LE(directoryEntries, 10);
  end.writeUInt32LE(directoryBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, directoryBytes, end]);
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Text, a number, an empty cell, or raw XML for the inside of a cell plus its attributes. */
export type SheetCell = string | number | null | { attributes?: string; inner: string };

export function columnLetters(column: number): string {
  let letters = "";
  for (let rest = column; rest > 0; rest = Math.floor((rest - 1) / 26)) {
    letters = String.fromCharCode(65 + ((rest - 1) % 26)) + letters;
  }
  return letters;
}

const XML_START = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const MAIN_NAMESPACE = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const LINKS_NAMESPACE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_LINKS_NAMESPACE = "http://schemas.openxmlformats.org/package/2006/relationships";
const WORKBOOK_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";

export interface WorkbookOptions {
  /** Replaces or removes (null) standard parts, by name. */
  overrides?: Record<string, string | null>;
  /** Added after the standard parts. */
  extraParts?: ZipPart[];
  uses1904Dates?: boolean;
  /** Leave every part uncompressed. */
  store?: boolean;
}

export function sheetXml(rows: ReadonlyArray<readonly SheetCell[]>, strings: Map<string, number>): string {
  const sharedIndex = (text: string): number => {
    const known = strings.get(text);
    if (known !== undefined) return known;
    strings.set(text, strings.size);
    return strings.size - 1;
  };

  const body: string[] = [];
  rows.forEach((cells, rowIndex) => {
    const rowNumber = rowIndex + 1;
    const xml: string[] = [];
    cells.forEach((cell, columnIndex) => {
      if (cell === null) return;
      const reference = `${columnLetters(columnIndex + 1)}${rowNumber}`;
      if (typeof cell === "string") {
        xml.push(`<c r="${reference}" t="s"><v>${sharedIndex(cell)}</v></c>`);
      } else if (typeof cell === "number") {
        xml.push(`<c r="${reference}"><v>${cell}</v></c>`);
      } else {
        xml.push(`<c r="${reference}" ${cell.attributes ?? ""}>${cell.inner}</c>`);
      }
    });
    body.push(`<row r="${rowNumber}">${xml.join("")}</row>`);
  });
  return `${XML_START}<worksheet xmlns="${MAIN_NAMESPACE}"><sheetData>${body.join("")}</sheetData></worksheet>`;
}

export function sharedStringsXml(strings: Map<string, number>): string {
  const items = [...strings.keys()].map((text) => `<si><t xml:space="preserve">${escapeXml(text)}</t></si>`);
  return `${XML_START}<sst xmlns="${MAIN_NAMESPACE}" count="${items.length}" uniqueCount="${items.length}">${items.join("")}</sst>`;
}

export function buildWorkbook(rows: ReadonlyArray<readonly SheetCell[]>, options: WorkbookOptions = {}): Uint8Array {
  const strings = new Map<string, number>();
  const sheet = sheetXml(rows, strings);
  const date1904 = options.uses1904Dates ? ' date1904="1"' : "";

  const standard: Record<string, string> = {
    "[Content_Types].xml":
      `${XML_START}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      `<Override PartName="/xl/workbook.xml" ContentType="${WORKBOOK_TYPE}"/></Types>`,
    "_rels/.rels":
      `${XML_START}<Relationships xmlns="${PACKAGE_LINKS_NAMESPACE}">` +
      `<Relationship Id="rId1" Type="${LINKS_NAMESPACE}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml":
      `${XML_START}<workbook xmlns="${MAIN_NAMESPACE}" xmlns:r="${LINKS_NAMESPACE}"><workbookPr${date1904}/>` +
      '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels":
      `${XML_START}<Relationships xmlns="${PACKAGE_LINKS_NAMESPACE}">` +
      `<Relationship Id="rId1" Type="${LINKS_NAMESPACE}/worksheet" Target="worksheets/sheet1.xml"/>` +
      `<Relationship Id="rId2" Type="${LINKS_NAMESPACE}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml": sheet,
    "xl/sharedStrings.xml": sharedStringsXml(strings),
  };

  const parts: ZipPart[] = [];
  for (const [name, data] of Object.entries(standard)) {
    const override = options.overrides?.[name];
    if (override === null) continue;
    parts.push({ name, data: override ?? data, store: options.store });
  }
  return buildZip([...parts, ...(options.extraParts ?? [])]);
}
