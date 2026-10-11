import { contactFromEnv } from "./contact";

/**
 * Strukturalni zdroj pravdy o obchodu: identita, kontakt, navigace.
 * Texty zijou ve slovniku (src/dictionaries), cisla a slugy tady.
 * Obchodni konstanty (MwSt, postovne) jsou v pricing.ts.
 *
 * Kontaktni udaje (adresa, telefon, UID) se ctou z promennych prostredi
 * (viz contact.ts a .env.example) — repozitar je verejny a patri do nej jen
 * to, co je verejne tak jako tak (jmeno, domena, slogan). Dokud nejsou vyplnene,
 * zobrazuji se stranky bez nich; spusteni (SHOP_LIVE=1) bez nich selze pri
 * startu/buildu (next.config.ts).
 */
export const site = {
  name: "tichy24.ch",
  owner: "Dušan Tichý",
  tagline: "Ihr Allrounder-Mechaniker",
  domain: "tichy24.ch",
  url: (process.env.SITE_URL ?? "https://tichy24.ch").replace(/\/$/, ""),

  contact: contactFromEnv(process.env),

  bank: {
    holder: process.env.SHOP_BANK_HOLDER ?? "Dušan Tichý",
    iban: process.env.SHOP_IBAN ?? "",
  },
} as const;

/** Je web uz verejny? Rozhoduje o noindex a robots.txt. */
export function isLive(): boolean {
  return process.env.SHOP_LIVE === "1";
}

/** "T24-00042" */
export function formatOrderNumber(n: number): string {
  return `T24-${String(n).padStart(5, "0")}`;
}
