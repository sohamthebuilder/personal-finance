// Only the parts of these two packages the reader uses. Local types avoid adding more packages (D-019).
declare module "yauzl" {
  import type { EventEmitter } from "node:events";
  import type { Readable } from "node:stream";

  export interface Entry {
    fileName: string;
    compressionMethod: number;
    uncompressedSize: number;
    crc32: number;
    isEncrypted(): boolean;
  }

  export interface ZipFile extends EventEmitter {
    entryCount: number;
    readEntry(): void;
    openReadStream(entry: Entry, callback: (error: Error | null, stream: Readable) => void): void;
    close(): void;
  }

  export interface Options {
    lazyEntries: boolean;
    decodeStrings: boolean;
    validateEntrySizes: boolean;
    strictFileNames: boolean;
  }

  export function fromBuffer(
    buffer: Buffer,
    options: Options,
    callback: (error: Error | null, zipFile: ZipFile) => void,
  ): void;

  const yauzl: { fromBuffer: typeof fromBuffer };
  export default yauzl;
}

declare module "sax" {
  export interface Tag {
    name: string;
    attributes: Record<string, string>;
  }

  export interface Options {
    trim: boolean;
    normalize: boolean;
    strictEntities: boolean;
    unparsedEntities: boolean;
  }

  export interface Parser {
    onerror: (error: Error) => void;
    ondoctype: (doctype: string) => void;
    onprocessinginstruction: (instruction: { name: string; body: string }) => void;
    onopentagstart: (tag: Tag) => void;
    onattribute: (attribute: { name: string; value: string }) => void;
    onopentag: (tag: Tag) => void;
    onclosetag: (name: string) => void;
    ontext: (text: string) => void;
    oncdata: (text: string) => void;
    /** The elements open right now. */
    tags: readonly Tag[];
    write(text: string): Parser;
    close(): Parser;
  }

  export function parser(strict: boolean, options: Options): Parser;

  const sax: { parser: typeof parser };
  export default sax;
}
