/**
 * Kontaktni a identifikacni udaje obchodu. Cisty modul bez zavislosti na
 * `process.env` — env se predava zvenku, aby sel testovat a aby ho mohl
 * pouzit i skript, ktery generuje staticke stranky pro GitHub Pages.
 *
 * Udaje (adresa, telefon, UID) NEJSOU v repozitari: repo je verejne a
 * hodnoty patri do promennych prostredi (Vercel, GitHub Actions `vars`).
 * Do vystupu se dostanou az pri behu/buildu, a to jen ty, ktere jsou vyplnene —
 * zadne zastupne texty v hranatych zavorkach.
 */

export interface Contact {
  email: string;
  phone: string;
  street: string;
  postalCode: string;
  city: string;
  /** Unternehmens-Identifikationsnummer, Format CHE-123.456.789 */
  uid: string;
  /** Kdy lze objednavku vyzvednout — pouze text. */
  pickupHours: string;
}

type Env = Record<string, string | undefined>;

function clean(value: string | undefined): string {
  return (value ?? "").trim();
}

export function contactFromEnv(env: Env): Contact {
  return {
    email: clean(env.SHOP_EMAIL) || "info@tichy24.ch",
    phone: clean(env.SHOP_PHONE),
    street: clean(env.SHOP_STREET),
    postalCode: clean(env.SHOP_POSTAL_CODE),
    city: clean(env.SHOP_CITY),
    uid: clean(env.SHOP_UID),
    pickupHours: clean(env.SHOP_PICKUP_HOURS) || "nach Vereinbarung",
  };
}

/** Promenne, bez kterych se obchod nesmi spustit (SHOP_LIVE=1). Impressum je povinne. */
export const LAUNCH_REQUIRED: ReadonlyArray<{ field: keyof Contact; env: string }> = [
  { field: "phone", env: "SHOP_PHONE" },
  { field: "street", env: "SHOP_STREET" },
  { field: "postalCode", env: "SHOP_POSTAL_CODE" },
  { field: "city", env: "SHOP_CITY" },
  { field: "uid", env: "SHOP_UID" },
];

/** Nazvy promennych prostredi, ktere pro spusteni chybi. */
export function missingForLaunch(contact: Contact): string[] {
  return LAUNCH_REQUIRED.filter(({ field }) => contact[field] === "").map(({ env }) => env);
}

/** ["Bahnhofstrasse 1", "8001 Zürich"] — jen vyplnene radky. */
export function addressLines(c: Contact): string[] {
  const town = [c.postalCode, c.city].filter(Boolean).join(" ");
  return [c.street, town].filter(Boolean);
}

/** "Bahnhofstrasse 1, 8001 Zürich" nebo "" kdyz neni nic vyplneno. */
export function addressInline(c: Contact): string {
  return addressLines(c).join(", ");
}

/** UID ve tvaru CHE-123.456.789 (volne: s MWST/TVA/IVA na konci i bez). */
export function looksLikeUid(value: string): boolean {
  return /^CHE-\d{3}\.\d{3}\.\d{3}(\s+(MWST|TVA|IVA))?$/i.test(value.trim());
}
