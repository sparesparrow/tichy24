# tichy24.ch — e-shop

Německy psaný (de-CH) e-shop pro **Dušana Tichého — „Ihr Allrounder-Mechaniker“**.
Katalog, košík, pokladna bez účtu, potvrzení objednávky a administrace objednávek a produktů.

Návod na nasazení (GitHub Pages → Vercel na `*.vercel.app` → registrace domény a DNS) je v [`NASAZENI.md`](NASAZENI.md).
Pravidla pro práci v repozitáři jsou v [`CLAUDE.md`](CLAUDE.md).

Původně vznikl jako složka `tichy24-shop/` v repozitáři `citadela` (hotelový web); postupy z něj jsou
převzaté a zkopírované, repozitáře nesdílí žádný kód.

## Doména

`tichy24.ch` se k **2026-10-10** v registru .ch (RDAP, `rdap.nic.ch`) vede jako **nezaregistrovaná**
(404; kontrolní domény `admin.ch` a `tichy.ch` vracejí 200). Registraci musí provést majitel u
registrátora — postup včetně DNS je v [`NASAZENI.md`](NASAZENI.md). Kontrola kdykoli:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://rdap.nic.ch/domain/tichy24.ch   # 404 = volná, 200 = registrovaná
```

## Příkazy

```bash
cp .env.example .env            # doplnit AUTH_SECRET (openssl rand -base64 32)
docker compose up -d            # Postgres (v dev taky — žádný SQLite)
npm install
npm run db:migrate              # schéma
SEED_DEMO_PRODUCTS=1 npm run db:seed   # admin + kategorie + demo produkty
npm run dev                     # http://localhost:3000

npm run typecheck
npm test                        # čistá logika (src/lib)
npm run check:stock             # souběh nad skutečnou DB (potřebuje Postgres)
npm run build
```

Admin: `/admin` (účet z `ADMIN_EMAIL` / `ADMIN_PASSWORD` v seedu).

## Architektura

Next.js 15 (App Router), React 19, Prisma 7 + Postgres, Auth.js v5 (jen admin), Zod, Vitest.
Bez webfontů, bez trackingu, bez knihovny pro stav košíku — nakupovat jde i bez JavaScriptu.

| Oblast | Kde | Poznámka |
|---|---|---|
| Texty | `src/dictionaries/de.ts` | Typ `Dictionary` = `typeof de`; další jazyk (fr/it) se deklaruje `: Dictionary` a chybějící klíč shodí typecheck. Slovník obsahuje funkce → klientským komponentám se předávají jen hotové řetězce. |
| Obchodní konstanty | `src/lib/pricing.ts` | MwSt (8,1 %), poštovné, limity. Čistý modul, používá ho i klientský formulář pokladny. |
| Identita a kontakt | `src/lib/site.ts`, `src/lib/contact.ts` | Jméno a slogan v kódu; adresa, telefon, UID z env `SHOP_*`. Texty právních stránek se z nich skládají. |
| Peníze | `src/lib/money.ts` | Vše v **Rappen** (`...Cents`), nikdy float. |
| Košík | `src/lib/cart.ts`, `cart-store.ts`, `cart-view.ts` | V cookie jen `{id, počet}`; **ceny se vždy čtou z DB**. |
| Pokladna | `src/lib/checkout.ts`, `src/app/actions.ts` | Validace vrací kódy chyb, texty doplňuje server. Honeypot proti botům. |
| Objednávky | `src/lib/orders.ts`, `order-status.ts` | Viz níže. |
| Admin | `src/app/admin/`, `src/auth*.ts`, `src/middleware.ts` | Middleware chrání jen `/admin/*` (veřejný katalog jím neprochází); každá mutace navíc volá `requireAdmin()`. |

**Sklad se nesmí prodat dvakrát.** `placeOrder()` odečítá jedním `UPDATE … WHERE stock >= n`
v jedné transakci; při souběhu druhý požadavek podmínku vyhodnotí znovu a neprojde. Totéž
u storna (`updateMany` s podmínkou na původní stav → sklad se vrací právě jednou).
`npm run check:stock` to dokazuje: z 12 souběžných objednávek na 3 kusy uspějí přesně 3.

### Co je převzaté z `citadela-app`

Stejný stack a konvence, protože je bude spravovat stejný člověk: Postgres i ve vývoji,
`prisma.config.ts` s `DATABASE_URL_UNPOOLED` pro migrace, adaptér `pg` v `src/lib/prisma.ts`,
`serverExternalPackages`, typovaný slovník, peníze v celých jednotkách, rozdělení auth na
edge-safe a Prisma část s dummy hashem proti odhalení existujících účtů, `requireAdmin()`
„podruhé“ v serveru, race-safe zápis přes podmíněný zápis v DB, čisté moduly s testy,
kontrolní skript nad skutečnou DB, `vercel-build` s `prisma migrate deploy`.

**Záměrně jinak:** žádné locale v URL (zatím jen němčina), žádný Google login ani Prisma adaptér
(zákazníci nemají účet, admin je jen e-mail + heslo), žádný `AccessEvent`/retence (neukládáme
pohyb osob; objednávky se v CH uchovávají 10 let, Art. 958f OR).

## Před spuštěním

Dokud `SHOP_LIVE` není `1`, web posílá `noindex` a `robots.txt` zakazuje vše. Zapněte ho až po:
(Kontaktní údaje se na stránkách zobrazují jen vyplněné; nikde nejsou zástupné texty.)

- [ ] Registraci domény a nastavení `SITE_URL`.
- [ ] **Vyplnění kontaktních údajů v proměnných prostředí** — `SHOP_STREET`, `SHOP_POSTAL_CODE`,
      `SHOP_CITY`, `SHOP_PHONE`, `SHOP_UID` (`CHE-…`), případně `SHOP_EMAIL` a `SHOP_PICKUP_HOURS`
      (ve Vercelu; pro GitHub Pages jako Actions *variables*). V kódu ani repozitáři nejsou.
      Bez povinných pěti **build s `SHOP_LIVE=1` selže** (`next.config.ts`).
- [ ] **Právní revizi** `legal.*` v `src/dictionaries/de.ts` (Impressum, AGB, Datenschutz).
      Je to **vzor**, ne právní poradenství. Zkontrolujte hlavně: platební lhůtu 10 dní, vyloučení
      práva na odstoupení, odpovědnost, výčet zpracovatelů v Datenschutz (hosting, DB).
- [ ] Rozhodnutí, zda je obchod **plátcem MwSt** (obrat ≥ 100 000 CHF). Pokud ne, nastavte
      `VAT_RATE_BP = 0` v `pricing.ts` — texty i souhrny MwSt přestanou zobrazovat.
- [ ] Nastavení skutečného **poštovného** (`SHIPPING` v `pricing.ts` — 9,90 / zdarma od 150 jsou zástupné).
- [ ] `SHOP_IBAN` a `SHOP_BANK_HOLDER` (jinak se na potvrzení ukáže „Bankverbindung per E-Mail“).
- [ ] Smazání demo produktů: `DELETE … WHERE sku LIKE 'DEMO-%'` (nebo je v adminu skryjte),
      nahrání skutečných produktů a fotek. **Seed s `SEED_DEMO_PRODUCTS=1` na produkci nespouštět.**
- [ ] Změně `ADMIN_PASSWORD` z výchozí hodnoty.
- [ ] Nastavení proměnných v hostingu: `DATABASE_URL` (Neon, `?sslmode=require`),
      `DATABASE_URL_UNPOOLED`, `AUTH_SECRET`, `SITE_URL`, `SHOP_LIVE`, `SHOP_IBAN`,
      `CRON_SECRET` (náhodná hodnota, např. `openssl rand -base64 32`),
      `RESEND_API_KEY` a `EMAIL_FROM` (odesílatel na ověřené doméně v Resend).

## Dočasná stránka na GitHub Pages

Dokud není doména a Vercel funkční, je z repozitáře publikovaná **statická úvodní stránka**
(`scripts/build-pages.mts` → `dist-pages/`, workflow `.github/workflows/pages.yml`): „Shop startet bald“,
kontakt, Impressum a Datenschutz. **Není to obchod** — GitHub Pages umí jen statické soubory, takže nemá
databázi, košík ani administraci. Adresa po zapnutí: `https://sparesparrow.github.io/tichy24/`.

Jednorázově v repozitáři: **Settings → Pages → Source: GitHub Actions**; kontaktní údaje do
**Settings → Secrets and variables → Actions → Variables** (`SHOP_PHONE`, `SHOP_STREET`,
`SHOP_POSTAL_CODE`, `SHOP_CITY`, `SHOP_UID`, …). Stránka je `noindex`, dokud není proměnná `PAGES_INDEX=1`.
Lokálně: `npm run build:pages` a otevřít `dist-pages/index.html`.

## Známá omezení

- **Transakční e-maily:** potvrzení zákazníkovi a oznámení obchodu se ukládají v `EmailOutbox`
  ve stejné databázové transakci jako objednávka. Vercel Cron každých 5 minut doručuje dávku přes
  Resend. Dočasné chyby se opakují (max. 8 pokusů s exponenciální prodlevou), konečné chyby jsou
  vidět v detailu objednávky v administraci. Stabilní `Idempotency-Key` omezuje duplicity při
  opakování po timeoutu. Vyžaduje `RESEND_API_KEY`, `EMAIL_FROM` z ověřené domény a `CRON_SECRET`.
  Cron každých 5 minut vyžaduje Vercel Pro/Enterprise; Hobby dovoluje jen jeden běh denně.
- **Žádná online platba.** Jen Vorkasse (převod) a hotovost při osobním převzetí. Další krok je
  Stripe Checkout nebo Payrexx s **TWINT** — ve Švýcarsku je to pro e-shop téměř nutnost.
  Rozšíření: nová hodnota `PaymentMethod`, webhook, který přepne stav na `PAID`.
- **Automatické storno nezaplacené Vorkasse:** Vercel Cron volá `/api/cron/expire-orders` jednou
  denně v 03:00 UTC. Zruší pouze objednávky `NEW` + `PREPAYMENT` po 10denní lhůtě a vrací sklad
  přes existující transakční `changeOrderStatus`. Endpoint vyžaduje `CRON_SECRET`; na Vercelu
  nastavte stejnou náhodnou hodnotu v proměnných prostředí. Úloha běží jen na produkčním deployi
  a čas spuštění se může podle plánu Vercelu lišit.
- **Omezení pokladny:** nejvýše 5 pokusů za 10 minut a 20 za hodinu z jedné klientské IP.
  Počítadla jsou atomická v PostgreSQL, takže platí napříč instancemi serverless funkcí. Do DB se
  ukládá pouze HMAC hash kombinující IP, rozsah a časové okno, nikoli surová IP; denní cron je čistí
  po expiraci. Pro odolnost proti sofistikovaným botům lze doplnit i pravidla Vercel Firewall.
- **Bez QR-faktury.** Švýcarský QR-bill by na potvrzení zlepšil Vorkasse; zatím jen IBAN + číslo
  objednávky jako účel platby.
- **Bez fotek produktů.** Do doby, než se nahraje `imageUrl`, se ukazuje piktogram kategorie.
  Obrázky se zadávají jako URL (`https`); vlastní upload by vyžadoval úložiště (např. Vercel Blob).
- Slogan na nálepce čtu jako „Ihr **Allrounder**-Mechaniker“ (na fotce je „Airounder“); zkontrolujte.
