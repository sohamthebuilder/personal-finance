// The driver's package.json hides its own types, and its API matches better-sqlite3.
declare module "better-sqlite3-multiple-ciphers" {
  import Database from "better-sqlite3";
  export = Database;
}
