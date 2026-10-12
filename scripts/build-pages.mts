/**
 * Vygeneruje staticke stranky pro GitHub Pages do `dist-pages/`.
 *
 *   npm run build:pages
 *   PAGES_INDEX=1 npm run build:pages     # povoli indexaci (vychozi: noindex)
 *
 * Kontaktni udaje se berou z promennych prostredi SHOP_* (viz .env.example);
 * v GitHub Actions z repository variables. Prazdny udaj se na strance
 * vynecha, zastupny ("[PLZ]") se zobrazi tak, jak je — a skript na oboji upozorni.
 */

import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  // .env neexistuje — spolehame na promenne prostredi (CI).
}

// Dynamicky import: slovnik i site cte process.env pri nacteni modulu.
const { de } = await import("../src/dictionaries/de");
const { site } = await import("../src/lib/site");
const { renderPages } = await import("../src/lib/pages");
const { missingForLaunch } = await import("../src/lib/contact");

const out = path.join(process.cwd(), "dist-pages");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const files = renderPages(de, site, { index: process.env.PAGES_INDEX === "1" });
for (const [name, content] of Object.entries(files)) {
  writeFileSync(path.join(out, name), content);
}
// Stejny vzhled jako obchod: sdilime stylesheet i ikonu, zadna kopie stylu.
cpSync(path.join(process.cwd(), "src/app/globals.css"), path.join(out, "style.css"));
cpSync(path.join(process.cwd(), "src/app/icon.svg"), path.join(out, "icon.svg"));

console.log(`dist-pages: ${Object.keys(files).length + 2} souboru`);

const missing = missingForLaunch(site.contact);
if (missing.length > 0) {
  // Syntaxe GitHub Actions: zobrazi se jako zluty vykricnik u behu workflow.
  console.log(
    `::warning title=Chybi udaje v Impressum::Nenastaveno nebo zastupna hodnota: ${missing.join(", ")}. ` +
      "Doplnte je jako repository variables (Settings > Secrets and variables > Actions > Variables).",
  );
}
