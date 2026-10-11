import { afterEach, describe, expect, it, vi } from "vitest";
import { de } from "@/dictionaries/de";
import { contactFromEnv } from "./contact";
import { esc, renderPages, type PagesSite } from "./pages";

const base: PagesSite = {
  name: "tichy24.ch",
  owner: "Dušan Tichý",
  tagline: "Ihr Allrounder-Mechaniker",
  contact: contactFromEnv({}),
};

describe("esc", () => {
  it("escapuje vse nebezpecne znaky", () => {
    expect(esc(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});

describe("renderPages", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const pages = renderPages(de, base, { index: false });

  it("vyrobi vsechny soubory", () => {
    expect(Object.keys(pages).sort()).toEqual(
      [".nojekyll", "404.html", "datenschutz.html", "impressum.html", "index.html", "robots.txt"].sort(),
    );
  });

  it("bez indexace posila noindex a robots Disallow", () => {
    expect(pages["index.html"]).toContain('content="noindex, nofollow"');
    expect(pages["robots.txt"]).toContain("Disallow: /");
  });

  it("s indexaci ji povoli", () => {
    const on = renderPages(de, base, { index: true });
    expect(on["index.html"]).toContain('content="index, follow"');
    expect(on["robots.txt"]).toContain("Allow: /");
  });

  it("bez vyplnenych udaju nepise zadne zastupne texty ani prazdne radky", () => {
    for (const html of Object.values(pages)) {
      expect(html).not.toMatch(/\[[A-Za-zÄÖÜäöü.\- ]+\]/);
      expect(html).not.toContain("Telefon: \n");
    }
    expect(pages["index.html"]).not.toContain("<dt>Telefon</dt>");
    expect(pages["index.html"]).not.toContain("<dt>Adresse</dt>");
    expect(pages["impressum.html"]).not.toContain("Unternehmens-Identifikationsnummer");
  });

  it("s vyplnenymi udaji je ukaze", async () => {
    // Slovnik sklada Impressum z process.env pri nacteni modulu, takze env
    // se nastavuje PRED importem (stejne jako ve scripts/build-pages.ts).
    vi.stubEnv("SHOP_PHONE", "+41 79 123 45 67");
    vi.stubEnv("SHOP_STREET", "Bahnhofstrasse 1");
    vi.stubEnv("SHOP_POSTAL_CODE", "8001");
    vi.stubEnv("SHOP_CITY", "Zürich");
    vi.stubEnv("SHOP_UID", "CHE-123.456.789");
    vi.resetModules();
    const { de: deFilled } = await import("@/dictionaries/de");
    const { site } = await import("./site");
    const out = renderPages(deFilled, site, { index: false });
    expect(out["index.html"]).toContain("+41 79 123 45 67");
    expect(out["index.html"]).toContain("8001 Zürich");
    expect(out["impressum.html"]).toContain("CHE-123.456.789");
    expect(out["impressum.html"]).toContain("Bahnhofstrasse 1");
  });

  it("escapuje hodnoty z env (zadne HTML injection)", () => {
    const evil: PagesSite = {
      ...base,
      contact: contactFromEnv({ SHOP_PHONE: `<script>alert(1)</script>`, SHOP_CITY: `"><img src=x>` }),
    };
    const out = renderPages(de, evil, { index: false });
    for (const html of Object.values(out)) {
      expect(html).not.toContain("<script>alert(1)");
      expect(html).not.toContain('"><img');
    }
  });

  it("pouziva jen relativni odkazy (funguje pod /tichy24/ i na domene)", () => {
    for (const [file, html] of Object.entries(pages)) {
      if (!file.endsWith(".html")) continue;
      expect(html).not.toMatch(/href="\//);
      expect(html).not.toMatch(/src="\//);
    }
  });
});
