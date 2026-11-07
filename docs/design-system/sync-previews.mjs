// Copies system.css and icons.svg into every preview, so each one opens as a single file.
// Run after any change to either file: node docs/design-system/sync-previews.mjs
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "system.css"), "utf8");
const block = `<style data-system>\n${css}</style>`;
const pattern = /<style data-system>[\s\S]*?<\/style>/;
const icons = readFileSync(join(here, "icons.svg"), "utf8").trim();
const iconPattern = /<svg data-icons[\s\S]*?<\/defs><\/svg>/;

const docs = join(here, "..", "phases");
const pages = [join(here, "gallery.html")];
for (const phase of readdirSync(docs, { withFileTypes: true })) {
  if (!phase.isDirectory()) continue;
  const previews = join(docs, phase.name, "previews");
  try {
    for (const file of readdirSync(previews)) if (file.endsWith(".html")) pages.push(join(previews, file));
  } catch {
    // This phase has no previews.
  }
}
for (const page of pages) {
  let html;
  try { html = readFileSync(page, "utf8"); } catch { continue; }
  if (pattern.test(html)) { writeFileSync(page, html.replace(pattern, () => block).replace(iconPattern, () => icons)); console.log("synced", page.split("/docs/")[1]); }
}
