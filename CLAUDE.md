# CLAUDE.md

Pokyny pro Claude Code (claude.ai/code) při práci v tomto repozitáři.

## Co to je

Německy psaný (de-CH) e-shop **tichy24.ch** pro Dušana Tichého („Ihr Allrounder-Mechaniker“).
Next.js 15 (App Router), React 19, Prisma 7 + Postgres, Auth.js v5 (jen administrace), Zod, Vitest.
Vznikl ve složce `tichy24-shop/` repozitáře `sparesparrow/citadela` a postupy z něj převzal.
Nasazení a doména: `NASAZENI.md`. Seznam věcí, které je nutné udělat před ostrým provozem
(zástupné údaje, právní revize, MwSt, poštovné, IBAN): `README.md`, sekce „Před spuštěním“.

## Příkazy

```bash
cp .env.example .env     # doplnit AUTH_SECRET
docker compose up -d     # Postgres (i ve vývoji — žádný SQLite)
npm install
npm run db:migrate       # schéma
SEED_DEMO_PRODUCTS=1 npm run db:seed   # admin + kategorie + demo produkty (SKU DEMO-*)
npm run dev              # http://localhost:3000

npm run typecheck
npm test                 # vitest, jen čistá logika v src/lib
npm run check:stock      # souběh objednávek nad skutečnou DB (potřebuje Postgres)
npm run build
```

Jeden test: `npx vitest run src/lib/pricing.test.ts`. Prisma CLI čte `DATABASE_URL` z `.env`
(`prisma.config.ts` ho načítá explicitně, Prisma 7 to sama nedělá). Po změně schématu
`npx prisma generate`; změny schématu na produkci **vždy jako migrace** (`vercel-build` spouští
`prisma migrate deploy`), nikdy `db push`.

## Jazyk a konvence

- **Texty pro zákazníky jsou německy** (de-CH, „ss“ místo „ß“) a žijí ve `src/dictionaries/de.ts`.
- **Komentáře jsou česky, bez diakritiky**, vysvětlují *proč*, ne *co*. Identifikátory anglicky.
- `Dictionary = typeof de`; další jazyk se deklaruje `: Dictionary` a chybějící klíč shodí typecheck —
  nepovolovat ten typ.
- **Slovník obsahuje funkce** (`common.vatLabelFor`, `cart.removeLabel`, `product.lowStock` …). React je
  nepřenese přes hranici server → klient, takže **klientským komponentám se nikdy nepředává celý `dict`**,
  jen hotové řetězce (viz `CheckoutLabels` v `CheckoutForm.tsx`, `kasse/page.tsx`).

## Architektura — co se nesmí rozbít

- **Peníze** jsou celá čísla v nejmenší jednotce (Rappen, pole `...Cents`), nikdy float.
  `src/lib/money.ts` formátuje a parsuje. Ceny v katalogu jsou **konečné** (včetně MwSt);
  MwSt se z nich „vytahuje“ (`vatIncluded`), nepřičítá. Sazba a poštovné jsou v `src/lib/pricing.ts`
  (čistý modul, používá ho i klientský formulář pokladny).
- **Košík je v cookie** (`{id, počet}`), **ceny se vždy čtou z DB** (`cart-view.ts`, `orders.ts`).
  Cookie je vstup od klienta.
- **Sklad se odečítá jen atomicky**: `placeOrder()` dělá `updateMany … WHERE stock >= n` v jedné
  transakci; „načíst, porovnat, uložit“ by prodalo poslední kus dvakrát. Storno vrací sklad jen přes
  `changeOrderStatus()` (podmíněný `updateMany` na původní stav → vrací právě jednou).
  `npm run check:stock` to dokazuje; při změně těchto funkcí ho spusťte.
- **Stavy objednávky** jsou v čistém `src/lib/order-status.ts` (závisí na způsobu platby). UI jen ukazuje
  tlačítka, **pravidla vynucuje server** (`changeOrderStatus`).
- **Potvrzení objednávky** je pod náhodným `publicToken`, ne pod číslem objednávky (to je uhodnutelné
  a stránka ukazuje adresu).
- **Auth** je rozdělená: `src/auth.config.ts` je edge-safe (bez Prisma a bcrypt) pro middleware,
  `src/auth.ts` přidává Prisma a bcrypt. Middleware chrání jen `/admin/*`; **každá server action
  administrace navíc volá `requireAdmin()`** (akce jsou veřejné POST endpointy). Přihlášení porovnává
  dummy hash i pro neexistující e-mail, aby doba odpovědi neprozradila účty.
- Validace pokladny (`checkout.ts`) vrací **kódy chyb**, texty doplňuje server z `dict.checkout.errors`.

## Testování

Vitest, Node, jen `src/**/*.test.ts` — záměrně čistá logika, ne routy a server actions.
Ty se ověřují proti běžícímu serveru a skriptem `check:stock`. CI (`.github/workflows/ci.yml`):
typecheck → testy → build → `check:stock` nad Postgresem bez hesla (`trust`) na Node 22.
Do repozitáře **nepatří žádná hesla ani tajemství, ani zástupná** — repo je veřejné a GitGuardian
označuje i `user:heslo@` v connection stringu.

## Známá omezení

- **Postgres i ve vývoji**; `next.config.ts` má `serverExternalPackages: ["pg", "@prisma/adapter-pg"]`
  — odstranění rozbije každou routu s Prismou. `assertProductionUrl()` v `src/lib/prisma.ts` na produkci
  vyžaduje `sslmode`.
- Prisma 7 vyžaduje **Node ≥ 20.19** (CI i Vercel: 22).
- **Bez e-mailů, bez online platby, bez automatického rušení nezaplacených objednávek, bez rate limitu**
  — viz README. Nepřidávat rate limit jako in-memory `Map` na serverless (per instance = nefunguje).
- Dokud `SHOP_LIVE≠1`, web posílá `noindex` a `robots.txt` zakazuje vše.
- **Kontaktní údaje (adresa, telefon, UID) jsou v env `SHOP_*`, ne v kódu** (repo je veřejné) —
  čistý modul `src/lib/contact.ts`, `site.contact` je čte. Texty se skládají jen z vyplněných hodnot
  (žádné zástupné řetězce); `next.config.ts` při `SHOP_LIVE=1` bez povinných údajů shodí build.
  Nové údaje přidávat přes `contact.ts` (+ test), ne přímo do `site.ts`.
- **GitHub Pages** (`pages.yml`, `scripts/build-pages.mts`, `src/lib/pages.ts`) publikuje jen statickou
  úvodní stránku, ne obchod. Všechno do HTML jde přes `esc()`; odkazy jsou relativní. Workflow dosazuje
  zástupné `[…]` hodnoty, když chybí repository variables; `missingForLaunch()` je počítá jako chybějící,
  takže `SHOP_LIVE=1` se zástupnými údaji neprojde.
- Nasazení jde **nejdřív na `*.vercel.app`** (`setup-vercel.ts --deploy`), doména až potom (`--domain`).
