import { addressLines, type Contact } from "./contact";
import type { Dictionary, LegalSection } from "@/dictionaries/de";

/**
 * Generator statickych stranek pro GitHub Pages — dokud neni domena a Vercel
 * hotovy, aby aspon nekde stal web. Cisty modul: dostane slovnik a udaje,
 * vrati mapu `soubor -> obsah`. Zapis na disk dela scripts/build-pages.ts.
 *
 * Neni to e-shop (statika nema databazi ani kosik) — je to uvodni stranka
 * s kontaktem, Impressum a ochranou udaju. Odkazy jsou relativni, aby web
 * fungoval jak na `uzivatel.github.io/tichy24/`, tak pozdeji na vlastni domene.
 */

export interface PagesSite {
  name: string;
  owner: string;
  tagline: string;
  contact: Contact;
}

export interface PagesOptions {
  /** Povolit indexaci? Vychozi ne — dokud web neni v ostrem stavu. */
  index: boolean;
}

/** Escapovani do HTML textu i atributu. Vsechno, co jde do stranky, jde pres tuhle funkci. */
export function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const MARK = `<svg class="brand-mark" viewBox="0 0 26 26" aria-hidden="true"><rect width="26" height="26" rx="5" fill="#d52b1e"/><path d="M13 6v14M6 13h14" stroke="#fff" stroke-width="4.5"/></svg>`;

function layout(
  d: Dictionary,
  site: PagesSite,
  opts: PagesOptions,
  page: { file: string; title: string; description: string; body: string },
): string {
  const robots = opts.index ? "index, follow" : "noindex, nofollow";
  const nav = [
    ["index.html", d.pages.nav.home],
    ["impressum.html", d.pages.nav.impressum],
    ["datenschutz.html", d.pages.nav.privacy],
  ]
    .map(([href, label]) => `<a href="${href}"${href === page.file ? ' aria-current="page"' : ""}>${esc(label)}</a>`)
    .join("");

  return `<!doctype html>
<html lang="de-CH">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.title)}</title>
<meta name="description" content="${esc(page.description)}">
<meta name="robots" content="${robots}">
<meta name="theme-color" content="#11110f">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="style.css">
</head>
<body>
<a class="skip-link" href="#main">${esc(d.common.skipToContent)}</a>
<header class="site-header"><div class="container header-inner">
<a class="brand" href="index.html" aria-label="${esc(site.name)}">${MARK}<span class="brand-word">tichy24</span><span class="brand-ch">.ch</span></a>
<nav class="nav" style="display:flex" aria-label="Navigation">${nav}</nav>
</div></header>
<main class="main" id="main">
${page.body}
</main>
<footer class="site-footer"><div class="container">
<div class="footer-bottom"><span>${esc(d.footer.rights(new Date().getFullYear()))}</span><span>${esc(site.tagline)}</span></div>
</div></footer>
</body>
</html>
`;
}

function legalBody(title: string, sections: LegalSection[]): string {
  const parts = sections
    .map(
      (s) =>
        `<section><h2>${esc(s.heading)}</h2>${s.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("")}</section>`,
    )
    .join("\n");
  return `<div class="container"><article class="legal"><h1>${esc(title)}</h1>\n${parts}\n</article></div>`;
}

export function renderPages(
  d: Dictionary,
  site: PagesSite,
  opts: PagesOptions,
): Record<string, string> {
  const l = d.pages.landing;
  const c = site.contact;
  const addr = addressLines(c);

  const contactRows = [
    `<dt>${esc(l.email)}</dt><dd><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></dd>`,
    c.phone ? `<dt>${esc(l.phone)}</dt><dd>${esc(c.phone)}</dd>` : "",
    addr.length ? `<dt>${esc(l.address)}</dt><dd style="white-space:pre-line">${esc([site.owner, ...addr].join("\n"))}</dd>` : "",
  ].join("");

  const landing = `<section class="hero"><div class="container"><div class="hero-inner">
<p class="eyebrow">${esc(site.tagline)}</p>
<h1>${esc(l.heading)}</h1>
<p class="lead">${esc(l.lead)}</p>
<p class="lead">${esc(l.notice)}</p>
</div></div></section>
<div class="container">
<section class="section"><div class="usp-grid">
${l.items.map((i) => `<div class="usp"><h3>${esc(i.title)}</h3><p>${esc(i.text)}</p></div>`).join("\n")}
</div></section>
<section class="section"><div class="section-head"><h2>${esc(l.contactHeading)}</h2></div>
<p>${esc(l.contactLead)}</p>
<div class="order-box"><dl class="kv">${contactRows}</dl></div></section>
</div>`;

  return {
    "index.html": layout(d, site, opts, {
      file: "index.html",
      title: l.title,
      description: l.description,
      body: landing,
    }),
    "impressum.html": layout(d, site, opts, {
      file: "impressum.html",
      title: `${d.legal.impressum.title} | ${site.name}`,
      description: d.legal.impressum.title,
      body: legalBody(d.legal.impressum.title, d.legal.impressum.sections),
    }),
    "datenschutz.html": layout(d, site, opts, {
      file: "datenschutz.html",
      title: `${d.pages.privacy.title} | ${site.name}`,
      description: d.pages.privacy.title,
      body: legalBody(d.pages.privacy.title, d.pages.privacy.sections),
    }),
    "404.html": layout(d, site, opts, {
      file: "404.html",
      title: `${d.notFound.title} | ${site.name}`,
      description: d.notFound.title,
      body: `<div class="container"><h1>${esc(d.notFound.title)}</h1><p>${esc(d.notFound.text)}</p><a class="btn" href="index.html">${esc(d.notFound.cta)}</a></div>`,
    }),
    "robots.txt": opts.index
      ? "User-agent: *\nAllow: /\n"
      : "User-agent: *\nDisallow: /\n",
    // GitHub Pages jinak zpracovava soubory pres Jekyll a ignoruje cesty s podtrzitkem.
    ".nojekyll": "",
  };
}
