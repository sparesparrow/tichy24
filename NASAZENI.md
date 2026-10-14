# Nasazení na tichy24.ch

Cíl: veřejný e-shop na `https://tichy24.ch`, hosting Vercel, databáze Neon (Postgres),
doména a DNS u **švýcarského registrátora** (Infomaniak, Hostpoint, cyon, Metanet …).

Postup je stejný jako u hotelu Citadela (repozitář `sparesparrow/citadela`,
`citadela-app/NASAZENI.md`): doména i DNS zůstávají u registrátora, **nameservery
neměníme**, do zóny jen přidáme dva A záznamy; web běží na Vercelu, data na Neonu,
proměnné prostředí nastaví skript. Rozdíl je jen v registrátorovi (Citadela je ve Wedosu)
a v tom, že tu není co plánovat přes cron.

## Pořadí kroků

1. **GitHub Pages** — hned, bez domény a bez databáze: statická úvodní stránka (sekce 9).
2. **Vercel na adrese `*.vercel.app`** — celý obchod (katalog, košík, pokladna, administrace) jde nasadit
   a vyzkoušet **dřív, než je doména** (sekce 1–2, bez přepínače `--domain`). Web je `noindex` (`SHOP_LIVE=0`).
3. **Registrace domény a DNS** (sekce 3–4).
4. **Připojení domény na Vercel** (`--domain`, `SITE_URL=https://tichy24.ch`), seed bez demo produktů, e-mail (sekce 5–6).
5. **Spuštění** (`SHOP_LIVE=1`, sekce 8).

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

### Rychlá cesta — nejdřív na `*.vercel.app` (bez domény)

```bash
npx vercel login                       # jednou, interaktivně
npm install
NEON_PROJECT_ID=<id> ADMIN_EMAIL="vy@example.ch" ADMIN_PASSWORD="…" \
  npm run setup:vercel -- --deploy
```

Skript propojí projekt, vytáhne oba připojovací řetězce z Neonu, vygeneruje `AUTH_SECRET`, nastaví
`SITE_URL=https://tichy24.vercel.app` a nasadí. **Doménu nepřipojuje** — ta přijde až v kroku 4 s přepínačem
`--domain`. Je idempotentní, takže se dá pustit znovu. Není ozkoušený proti živému Vercelu — při prvním
běhu zkontrolujte výpis a `npx vercel env ls`. Pokud Vercel projektu přidělí jiný název než `tichy24`,
nastavte `SITE_URL` na skutečnou adresu (jinak míří canonical a sitemap jinam) a nasaďte znovu.

**Co v tomto kroku platí:**
- Web je `noindex` (`SHOP_LIVE=0`), ale **veřejně dosažitelný** — nikam ho neodkazujte; objednávky z něj
  by šly do vybrané databáze.
- **Databáze:** pro zkoušku s demo produkty dejte `NEON_BRANCH=development` (a po seedu s
  `SEED_DEMO_PRODUCTS=1` na tuto větev se dá obchod proklikat). Pro ostrá data pak `production` bez demo seedu.
  Demo seed na `production` nikdy nespouštějte.
- Údaje do Impressum nejsou potřeba (chybějící se na stránkách vynechají); jsou povinné až pro `SHOP_LIVE=1`.
- **Hobby plán Vercelu zakazuje komerční provoz** — na zkoušku stačí, pro ostrý obchod **Pro**.

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
| `RATE_LIMIT_SECRET` | Doporučený samostatný klíč pro HMAC rate limitu (`openssl rand -base64 32`); pokud chybí, použije se `AUTH_SECRET` |
| `AUTH_TRUST_HOST` | `true` |
| `SITE_URL` | nejdřív `https://tichy24.vercel.app`, po připojení domény `https://tichy24.ch` (bez lomítka, apex bez `www`) |
| `SHOP_LIVE` | `0`, dokud neodškrtáte „Před spuštěním“ v README; pak `1` |
| `CRON_SECRET` | Náhodný secret (např. `openssl rand -base64 32`); zabezpečuje oba plánované úkoly |
| `RESEND_API_KEY` | API klíč Resend; uložte jako tajemství ve Vercelu |
| `EMAIL_FROM` | Odesílatel na doméně ověřené v Resend, např. `Tichy24 <orders@tichy24.ch>` |
| `SHOP_IBAN`, `SHOP_BANK_HOLDER` | bankovní spojení pro platbu předem; `SHOP_IBAN` je povinný při `SHOP_LIVE=1` |
| `SHOP_STREET`, `SHOP_POSTAL_CODE`, `SHOP_CITY`, `SHOP_PHONE`, `SHOP_UID` | údaje do Impressum — **povinné pro `SHOP_LIVE=1`** (jinak build selže); v repozitáři nejsou |
| `SHOP_EMAIL`, `SHOP_PICKUP_HOURS` | volitelné (výchozí `info@tichy24.ch`, „nach Vereinbarung“) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | jen pro seed (krok 5); silné heslo |

---

## 3. Registrace domény `tichy24.ch`

Registraci a platbu provádí majitel u zvoleného registrátora.

**Doporučení: [Infomaniak](https://www.infomaniak.com/)** — švýcarská firma, `.ch` patří k nejlevnějším
(orientačně 7–12 USD/rok podle agregátoru [domainoffer.net](https://domainoffer.net/tld/ch/infomaniak),
**aktuální cenu v CHF ověřte na jejich ceníku**), převod domény je zdarma, v jednom účtu jde mít i e-mail
`info@tichy24.ch` (krok 6), DNS editor je standardní. Alternativy: Hostpoint, cyon, Metanet (ceny jsem
nezjistil — porovnejte u nich). Rozhodující není nejnižší cena prvního roku, ale **cena prodloužení**.

1. **Znovu ověřte dostupnost** (stav se mění):
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" https://rdap.nic.ch/domain/tichy24.ch   # 404 = volná
   ```
   (K 2026-10-10 byla volná. Jméno je na nálepce, proto s registrací neotálejte.)
2. Objednejte `tichy24.ch` u registrátora. **Držitel: Dušan Tichý** se skutečnou adresou —
   stejné údaje patří do Impressum (proměnné `SHOP_*`, viz krok 2).
3. Zapněte **automatické prodloužení** a **dvoufázové ověření** účtu u registrátora.
   Ztráta účtu = ztráta domény i e-mailu.
4. DNSSEC (.ch ho podporuje) zapínejte až **po** tom, co web funguje; špatně nastavený
   DNSSEC rozbije překlad jména úplně.

Registrátora zvolte podle toho, kde chcete mít i **e-mail** (krok 6) — rozdělovat doménu
a poštu mezi dva dodavatele je zbytečná komplikace.

---

## 4. DNS u registrátora

Až **po** zaregistrování domény. Na Vercelu: **Settings → Domains → Add** → `tichy24.ch`
(nebo `npm run setup:vercel -- --deploy --domain`, který zároveň přepne `SITE_URL` na doménu); přidejte i `www.tichy24.ch`
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

Aplikace posílá transakční e-maily přes Resend. Ověřte odesílací doménu v Resend a nastavte RESEND_API_KEY a EMAIL_FROM ve Vercelu. Potvrzení objednávky se zákazníkovi a oznámení obchodu ukládají do databázové fronty při vytvoření objednávky. Vercel Cron posílá frontu každých 5 minut přes /api/cron/send-emails; stav a případná chyba jsou vidět v detailu objednávky v administraci. Frekvence každých 5 minut vyžaduje Vercel plán s podporou častějšího než denního cronu.

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

1. Odškrtat **„Před spuštěním“** v `README.md`: proměnné `SHOP_*` pro Impressum, právní revize,
   MwSt a poštovné, IBAN, smazání `DEMO-` produktů, vlastní produkty a fotky.
2. Funkční `info@tichy24.ch` (krok 6).
3. Nastavit `SHOP_LIVE=1` na Vercelu a znovu nasadit.
4. Teprve pak odkaz sdílet; sitemap se do vyhledávačů hlásí ručně.

> Repozitář je **veřejný**, proto kontaktní údaje (adresa, telefon, UID) v repozitáři nejsou, jen v proměnných
> prostředí. Do výsledného webu (Impressum) se dostanou — to je veřejné ze zákona tak jako tak.

---

## 9. Mezistupeň: statická stránka na GitHub Pages

Než je doména a Vercel funkční, běží z repozitáře **statická úvodní stránka** (workflow `pages.yml`).
Není to obchod: žádná databáze, košík ani administrace.

1. V repozitáři **Settings → Pages → Build and deployment → Source: GitHub Actions** (jednorázově; tohle
   `GITHUB_TOKEN` neumí). Pak v **Actions → GitHub Pages → Run workflow** (nebo další push do `main`).
2. **Settings → Secrets and variables → Actions → Variables:** `SHOP_PHONE`, `SHOP_STREET`,
   `SHOP_POSTAL_CODE`, `SHOP_CITY`, `SHOP_UID` (+ volitelně `SHOP_EMAIL`, `PAGES_INDEX=1`). Bez nich se stránka
   publikuje jen s e-mailem a build vypíše žlutou výstrahu.
3. Adresa: `https://sparesparrow.github.io/tichy24/`. Stránka je `noindex`, dokud nenastavíte `PAGES_INDEX=1`.

**Vlastní doména na GitHub Pages** (volitelné, jen jako přechodné řešení): po registraci v **Settings → Pages →
Custom domain** zadat `tichy24.ch` a u registrátora nastavit DNS podle aktuálního návodu GitHubu
(*Managing a custom domain for your GitHub Pages site* — `A` záznamy na adresy GitHubu pro apex a `CNAME`
pro `www` na `sparesparrow.github.io`; adresy opisujte z jejich dokumentace). **Při přechodu na Vercel**
(kroky 2–4) tyto záznamy nahradíte hodnotami z Vercelu a v Pages vlastní doménu odeberete — pak se
nesmí na jednom jméně míchat záznamy obou služeb.
