# Nasazení na tichy24.ch

Cíl: veřejný e-shop na `https://tichy24.ch`, hosting Vercel, databáze Neon (Postgres),
doména a DNS u **švýcarského registrátora** (Infomaniak, Hostpoint, cyon, Metanet …).

Postup je stejný jako u hotelu Citadela (repozitář `sparesparrow/citadela`,
`citadela-app/NASAZENI.md`): doména i DNS zůstávají u registrátora, **nameservery
neměníme**, do zóny jen přidáme dva A záznamy; web běží na Vercelu, data na Neonu,
proměnné prostředí nastaví skript. Rozdíl je jen v registrátorovi (Citadela je ve Wedosu)
a v tom, že tu není co plánovat přes cron.

> **Co z tohoto postupu dělá člověk a co ne.** Registrovat doménu (a platit), přihlásit se
> do Vercelu / Neonu a vkládat záznamy do DNS může jen majitel. Skript `setup-vercel.ts`
> se nikdy nepřihlašuje a na DNS nesahá.

---

## 0. Co je potřeba mít

| Účet | K čemu | Cena |
| --- | --- | --- |
| Registrátor domény `.ch` | doména, DNS, případně e-mail | cca desítky CHF/rok — ověřte u registrátora |
| [Neon](https://neon.tech) | Postgres | free tier stačí na start (0,5 GB) |
| [Vercel](https://vercel.com) | hosting Next.js | Hobby zakazuje komerční provoz → pro ostrý obchod **Pro** (20 $/měs.) |
| GitHub (`sparesparrow/tichy24`) | zdroj pro deploy | — |

---

## 1. Databáze na Neonu

Založte projekt **`tichy24`** v regionu **AWS eu-central-1 (Frankfurt)** — sedí k `fra1`
ve `vercel.json`, takže dotazy nechodí přes oceán. Vytvořte dvě větve:

| Větev | Účel |
| --- | --- |
| `production` (výchozí) | ostrá data, čte ji Vercel |
| `development` | lokální vývoj a seed s demo produkty |

Rozdělení není kosmetika: lokální `SEED_DEMO_PRODUCTS=1 npm run db:seed` zakládá fiktivní
zboží (`DEMO-…`). Kdyby mířil na produkci, objevilo by se v živém obchodě.

```bash
npx neonctl auth                              # jednou, interaktivně
npx neonctl projects create --name tichy24 --region-id aws-eu-central-1
npx neonctl connection-string production  --project-id <ID> --pooled
npx neonctl connection-string development --project-id <ID> --pooled
```

### Pooled vs. přímé spojení

Aplikace jede přes **pooled** endpoint (`-pooler` v hostname) — serverless funkce se škálují
po desítkách instancí a přímé spojení by vyčerpalo limit Neonu. **Migrace naopak potřebují
přímé spojení**: pooler běží přes PgBouncer v transakčním režimu, kde neprojde advisory zámek
z `prisma migrate deploy`. Rozdělení je v `prisma.config.ts` (čte `DATABASE_URL_UNPOOLED`);
běžící aplikace používá adaptér v `src/lib/prisma.ts` a `DATABASE_URL`.
**Na Vercelu proto musí být obě proměnné**, jinak build spadne na migraci.

Řetězec musí obsahovat `sslmode`. Bez něj se aplikace na produkci úmyslně odmítne spustit.

Schéma se na produkci nasadí samo: `vercel-build` spouští `prisma migrate deploy`.
Změny schématu proto **vždy jako migrace** v `prisma/migrations/`, nikdy `db push`.

---

## 2. Projekt na Vercelu

### Rychlá cesta

```bash
npx vercel login                       # jednou, interaktivně
npm install
NEON_PROJECT_ID=<id> ADMIN_EMAIL="vy@example.ch" ADMIN_PASSWORD="…" \
  SHOP_IBAN="CH…" npm run setup:vercel -- --deploy
```

Skript propojí projekt, vytáhne oba připojovací řetězce z Neonu, vygeneruje `AUTH_SECRET`,
nasadí a na konci vypíše hodnoty pro DNS. Je idempotentní, takže se dá pustit znovu.
Není ozkoušený proti živému Vercelu — při prvním běhu zkontrolujte výpis a `npx vercel env ls`.

### Nebo ručně

**New Project** → import `sparesparrow/tichy24`.

| Nastavení | Hodnota |
| --- | --- |
| Framework | Next.js (detekuje se sám) |
| **Root Directory** | **`.`** (aplikace je v kořeni — na rozdíl od citadely) |
| Build Command | ponechte výchozí — použije se `vercel-build` z `package.json` |
| Node.js Version | 22.x (Prisma 7 vyžaduje ≥ 20.19) |

Proměnné prostředí (scope **Production**):

| Proměnná | Hodnota |
| --- | --- |
| `DATABASE_URL` | **pooled** řetězec větve `production` |
| `DATABASE_URL_UNPOOLED` | **přímý** řetězec téže větve (bez `-pooler`) |
| `AUTH_SECRET` | `openssl rand -base64 32` — vložte rovnou do Vercelu, do repozitáře nepatří |
| `AUTH_TRUST_HOST` | `true` |
| `SITE_URL` | `https://tichy24.ch` (bez lomítka, apex bez `www`) |
| `SHOP_LIVE` | `0`, dokud neodškrtáte „Před spuštěním“ v README; pak `1` |
| `SHOP_IBAN`, `SHOP_BANK_HOLDER` | bankovní spojení pro platbu předem |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | jen pro seed (krok 5); silné heslo |

---

## 3. Registrace domény `tichy24.ch`

Registraci a platbu provádí majitel u zvoleného registrátora.

1. **Znovu ověřte dostupnost** (stav se mění):
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" https://rdap.nic.ch/domain/tichy24.ch   # 404 = volná
   ```
   (K 2026-10-10 byla volná. Jméno je na nálepce, proto s registrací neotálejte.)
2. Objednejte `tichy24.ch` u registrátora. **Držitel: Dušan Tichý** se skutečnou adresou —
   stejné údaje patří do Impressum (`src/lib/site.ts`).
3. Zapněte **automatické prodloužení** a **dvoufázové ověření** účtu u registrátora.
   Ztráta účtu = ztráta domény i e-mailu.
4. DNSSEC (.ch ho podporuje) zapínejte až **po** tom, co web funguje; špatně nastavený
   DNSSEC rozbije překlad jména úplně.

Registrátora zvolte podle toho, kde chcete mít i **e-mail** (krok 6) — rozdělovat doménu
a poštu mezi dva dodavatele je zbytečná komplikace.

---

## 4. DNS u registrátora

Na Vercelu: **Settings → Domains → Add** → `tichy24.ch`; přidejte i `www.tichy24.ch`
(`www` pak přesměruje na apex). Vercel u každé domény zobrazí kartu s **konkrétními
hodnotami** — opište je, neopisujte z návodů: adresa se liší per projekt (u Citadely
`76.76.21.21`, u novějších projektů `216.198.79.1`). Stejné hodnoty vypíše
`npm run setup:vercel -- --deploy`.

U registrátora (název sekce se liší: „DNS“, „Zone editor“, „DNS-Einträge“):

1. **Smažte výchozí / parkovací záznamy** apexu a `www` (A, AAAA, CNAME na parkovací stránku
   registrátora). Zůstalo-li tam staré A vedle nového, DNS vrací obě adresy dohromady a část
   návštěvníků skončí na parkovací stránce — vypadá to jako náhodný výpadek.
2. **Vypněte registrátorský „web parking“, proxy nebo předvolený hosting** pro tuto doménu,
   pokud nějaký je — Vercel potřebuje vidět na doménu přímo, jinak neověří vlastnictví
   a nevystaví certifikát.
3. Přidejte:

   | Název | Typ | Hodnota | TTL |
   | --- | --- | --- | --- |
   | *(prázdné = apex)* | `A` | hodnota z karty Vercelu | 300 |
   | `www` | `A` (nebo `CNAME`, jak řekne Vercel) | hodnota z karty Vercelu | 300 |

   Nízké TTL 300 s je záměr pro první dny; až bude web stát, zvedněte na 3600.
4. Pokud registrátor změny zóny „potvrzuje“ nebo publikuje zvlášť, publikujte — bez toho se
   záznam uloží, ale nezveřejní.

Certifikát vystaví Vercel automaticky (Let's Encrypt), obvykle do pár minut po propsání DNS.
Když se nevystaví, zkontrolujte `CAA` záznam; musí povolovat Let's Encrypt:

```
tichy24.ch.  CAA  0 issue "letsencrypt.org"
```

---

## 5. První spuštění administrace

Migrace na produkční větvi proběhly při nasazení, ale databáze je prázdná. Z vlastního
počítače, s **produkčním** řetězcem (lokální `.env` míří na `development`, takže ho
přebijte):

```bash
DATABASE_URL="$(npx neonctl connection-string production --project-id <ID> --pooled)" \
  ADMIN_EMAIL="vy@example.ch" ADMIN_PASSWORD="…" npm run db:seed
```

**Bez `SEED_DEMO_PRODUCTS=1`** — to zakládá fiktivní zboží. Seed vytvoří administrátora
a čtyři kategorie; produkty zadáte v `/admin/produkte`. Přihlášení: `https://tichy24.ch/admin`.

---

## 6. E-mail `info@tichy24.ch`

Adresa je uvedená v Impressum, na stránce Kontakt a v AGB. Nastavte u registrátora schránku
nebo přesměrování a přidejte jeho **MX záznamy** (a SPF/DKIM podle jeho návodu). **Dokud
adresa nepřijímá poštu, nepřepínejte `SHOP_LIVE=1`.**

Aplikace zatím sama žádné e-maily neposílá (viz „Známá omezení“ v README).

---

## 7. Kontrola po nasazení

```bash
curl -sI https://tichy24.ch/ | head -3            # 200, hlavičky Vercelu
getent hosts tichy24.ch                           # jedna adresa, ne parkovací
curl -s https://tichy24.ch/robots.txt             # "Disallow: /" dokud SHOP_LIVE≠1
curl -sI https://tichy24.ch/shop | head -1        # 200
curl -s  https://tichy24.ch/sitemap.xml | head -3
```

Testovací objednávka: přidat zboží do košíku, projít pokladnu, v `/admin` ji zrušit
(sklad se vrátí).

---

## 8. Spuštění

1. Odškrtat **„Před spuštěním“** v `README.md`: údaje v `src/lib/site.ts`, právní revize,
   MwSt a poštovné, IBAN, smazání `DEMO-` produktů, vlastní produkty a fotky.
2. Funkční `info@tichy24.ch` (krok 6).
3. Nastavit `SHOP_LIVE=1` na Vercelu a znovu nasadit.
4. Teprve pak odkaz sdílet; sitemap se do vyhledávačů hlásí ručně.

> Repozitář je **veřejný**. Údaje vyplněné v `src/lib/site.ts` (adresa, telefon, UID) se tím
> zveřejní i na GitHubu; Impressum je stejně veřejné, ale zvažte přesun do proměnných
> prostředí, pokud to nechcete.
