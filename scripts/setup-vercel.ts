/**
 * Nastaví projekt na Vercelu do stavu, ze kterého jde nasadit.
 *
 * Ručně to znamená naklikat deset proměnných prostředí, nepřehodit pooled
 * a přímý řetězec k databázi a u žádné neudělat překlep. Tenhle skript to
 * udělá za jeden běh a je idempotentní — pustit ho podruhé nic nerozbije,
 * existující proměnné přepíše. (Stejný postup jako v repozitáři citadela.)
 *
 *   npx vercel login                       # jednou, interaktivně, dělá člověk
 *   npx neonctl auth                       # jednou, interaktivně, dělá člověk
 *   NEON_PROJECT_ID=<id> npm run setup:vercel
 *   NEON_PROJECT_ID=<id> npm run setup:vercel -- --deploy             # nasadí na https://tichy24.vercel.app
 *   NEON_PROJECT_ID=<id> npm run setup:vercel -- --deploy --domain    # + připojí tichy24.ch
 *
 * Nejdřív se nasazuje bez domény na výchozí adresu `*.vercel.app` — obchod jde
 * vyzkoušet dřív, než je doména zaregistrovaná a DNS přepnuté. `--domain` přidej
 * až potom: nastaví SITE_URL na doménu a připojí tichy24.ch + www.
 * NEON_BRANCH (výchozí `production`) vybírá větev databáze; pro zkušební nasazení
 * s demo produkty lze dát `development` (na ostrou větev se demo seed nespouští).
 *
 * Volitelně: ADMIN_EMAIL + ADMIN_PASSWORD (čte je jen seed), SHOP_IBAN,
 * SHOP_BANK_HOLDER a kontaktní údaje SHOP_EMAIL/PHONE/STREET/POSTAL_CODE/CITY/UID/
 * PICKUP_HOURS (Impressum). Heslo patří člověku, takže se nikdy negeneruje samo.
 *
 * Co skript zásadně NEDĚLÁ: nesahá na DNS u registrátora, nepřihlašuje se
 * a nic neregistruje. Konkrétní A záznamy vypíše na konci — Vercel je
 * přiděluje per projekt, takže se nedají předem uhodnout.
 *
 * !! Není ozkoušený proti živému Vercelu ani Neonu (vyžaduje přihlášení
 * !! člověka). Při prvním běhu zkontrolujte výpis a `vercel env ls`.
 */

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const DOMAIN = "tichy24.ch";
/** Projekt na Vercelu — ten, který je propojený s GitHubem. */
const PROJECT = process.env.VERCEL_PROJECT ?? "tichy24";

const WITH_DOMAIN = process.argv.includes("--domain");
const NEON_BRANCH = process.env.NEON_BRANCH ?? "production";

/**
 * Veřejná adresa. Bez `--domain` výchozí `https://<projekt>.vercel.app` — pokud je
 * název projektu na Vercelu obsazený, přidělí jiný; skutečnou adresu po nasazení
 * vypíšeme a když se liší, nastaví se SITE_URL ručně (jinak míří canonical a sitemap jinam).
 */
const SITE_URL = process.env.SITE_URL ?? (WITH_DOMAIN ? `https://${DOMAIN}` : `https://${PROJECT}.vercel.app`);

/** Proměnné, které nejsou tajemství a mají pevnou hodnotu. */
const PLAIN_VARS: Record<string, string> = {
  SITE_URL,
  AUTH_TRUST_HOST: "true",
  // Web zůstává nezaindexovaný, dokud člověk neodškrtá „Před spuštěním“
  // v README a ručně nepřepne na 1.
  SHOP_LIVE: "0",
};

function run(cmd: string, args: string[], input?: string): string {
  return execFileSync(cmd, args, {
    encoding: "utf8",
    input,
    stdio: ["pipe", "pipe", "pipe"],
    shell: process.platform === "win32",
  });
}

function tryRun(cmd: string, args: string[], input?: string): string | null {
  try {
    return run(cmd, args, input);
  } catch {
    return null;
  }
}

/**
 * Neon vrací řetězec na poslední řádce, ale před ním umí být hlášky npx.
 * Bereme proto poslední řádku, která vypadá jako connection string.
 */
function neonUrl(projectId: string, branch: string, pooled: boolean): string {
  const args = ["-y", "neonctl", "connection-string", branch, "--project-id", projectId];
  if (pooled) args.push("--pooled");
  const out = run("npx", args);
  const line = out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("postgresql://"))
    .pop();
  if (!line) throw new Error(`Neon nevrátil connection string pro větev ${branch}.`);
  return line;
}

/**
 * `vercel env add` čte hodnotu ze stdin. Existující proměnnou nepřepíše,
 * proto ji nejdřív odstraníme — selhání odstranění je v pořádku, znamená
 * jen, že tam ještě nebyla.
 */
function setEnv(name: string, value: string): void {
  tryRun("npx", ["-y", "vercel", "env", "rm", name, "production", "--yes"]);
  run("npx", ["-y", "vercel", "env", "add", name, "production"], `${value}\n`);
  console.log(`  ok   ${name}`);
}

function main(): void {
  const neonProject = process.env.NEON_PROJECT_ID;
  if (!neonProject) {
    console.error(
      "Chybí NEON_PROJECT_ID. Založte projekt na Neonu (viz NASAZENI.md, krok 1) a předejte jeho ID:\n" +
        "  NEON_PROJECT_ID=<id> npm run setup:vercel",
    );
    process.exit(1);
  }

  const who = tryRun("npx", ["-y", "vercel", "whoami"]);
  if (!who || /Logged out/i.test(who)) {
    console.error("Nejste přihlášen k Vercelu. Spusťte `npx vercel login` a zkuste znovu.");
    process.exit(1);
  }
  console.log(`Vercel: ${who.trim().split(/\r?\n/).pop()}`);

  console.log("\nPropojuji projekt…");
  run("npx", ["-y", "vercel", "link", "--yes", "--project", PROJECT]);

  console.log("\nTahám připojovací řetězce z Neonu…");
  console.log(`  větev Neonu: ${NEON_BRANCH}`);
  const pooled = neonUrl(neonProject, NEON_BRANCH, true);
  const direct = neonUrl(neonProject, NEON_BRANCH, false);
  if (!pooled.includes("-pooler")) throw new Error("Pooled řetězec nemá -pooler.");
  if (direct.includes("-pooler")) throw new Error("Přímý řetězec má -pooler.");
  if (!/sslmode=/.test(pooled) || !/sslmode=/.test(direct)) {
    // src/lib/prisma.ts se na produkci bez sslmode záměrně odmítne spustit.
    throw new Error("Připojovací řetězec z Neonu nemá sslmode — aplikace by se nespustila.");
  }

  console.log("\nNastavuji proměnné prostředí (production):");
  setEnv("DATABASE_URL", pooled);
  setEnv("DATABASE_URL_UNPOOLED", direct);
  for (const [name, value] of Object.entries(PLAIN_VARS)) setEnv(name, value);

  // Tajemství se generují tady a nikam se neukládají. Kdo je potřebuje
  // znovu, přečte si je ve Vercelu; do repozitáře nepatří.
  setEnv("AUTH_SECRET", randomBytes(32).toString("base64"));

  // Kontaktni udaje (Impressum) a banka — jen to, co clovek zadal; nic se nevymysli.
  const optional = [
    "SHOP_IBAN", "SHOP_BANK_HOLDER", "SHOP_EMAIL", "SHOP_PHONE", "SHOP_STREET",
    "SHOP_POSTAL_CODE", "SHOP_CITY", "SHOP_UID", "SHOP_PICKUP_HOURS",
  ];
  for (const name of optional) {
    const value = process.env[name];
    if (value) setEnv(name, value);
    else console.log(`  --   ${name} přeskočeno (nezadáno; doplníte ve Vercelu před spuštěním).`);
  }

  // ADMIN_* čte jen seed, ne běžící aplikace — nasazení na nich neblokujeme.
  const admin = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (admin && adminPassword) {
    setEnv("ADMIN_EMAIL", admin);
    setEnv("ADMIN_PASSWORD", adminPassword);
  } else {
    console.log(
      "  --   ADMIN_EMAIL/ADMIN_PASSWORD přeskočeny (čte je jen seed).\n" +
        "       Účet personálu založíte podle kroku 5 v NASAZENI.md.",
    );
  }

  if (process.argv.includes("--deploy")) {
    console.log("\nNasazuji…");
    const out = run("npx", ["-y", "vercel", "deploy", "--prod", "--yes"]);
    console.log(out);

    // `vercel deploy` vypíše adresu nasazení; alias projektu na *.vercel.app je
    // stabilní (https://<projekt>.vercel.app) a SITE_URL by na něj měl ukazovat.
    const deployed = out.match(/https:\/\/[^\s]+\.vercel\.app/)?.[0];
    if (deployed) console.log(`Nasazeno: ${deployed}`);
    if (!WITH_DOMAIN && process.env.SITE_URL === undefined) {
      console.log(
        `SITE_URL je nastavené na ${SITE_URL}. Pokud Vercel projektu přidělil jiný název, ` +
          "opravte SITE_URL (SITE_URL=… npm run setup:vercel -- --deploy) a nasaďte znovu.",
      );
    }

    if (WITH_DOMAIN) {
      console.log(`\nPřipojuji doménu ${DOMAIN}…`);
      tryRun("npx", ["-y", "vercel", "domains", "add", DOMAIN, PROJECT]);
      tryRun("npx", ["-y", "vercel", "domains", "add", `www.${DOMAIN}`, PROJECT]);

      console.log("\nHodnoty pro DNS u registrátora (opište přesně tyto, ne z návodů):");
      console.log(tryRun("npx", ["-y", "vercel", "domains", "inspect", DOMAIN]) ?? "(nedostupné)");
    } else {
      console.log("\nDoména zatím není připojená (přepínač --domain až po registraci a přepnutí DNS).");
    }
  } else {
    console.log("\nProměnné jsou nastavené. Nasazení: znovu s přepínačem --deploy.");
  }
}

main();
