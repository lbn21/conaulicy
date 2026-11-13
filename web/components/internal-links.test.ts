import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

// Every link inside the site is Next.js's <Link> (CLAUDE.md): a
// page of the site, or an id on the same page (FragmentLink). A plain <a>
// only for another site, mailto: or a file the browser opens itself (ICS,
// PDF, /fonts/OFL.txt), which is no page of the app. This reads every plain
// <a> in the site's components and pages: a literal href must be another
// site, mailto: or a listed file; an expression must be listed here, with
// what it holds, so a new plain <a> is looked at before it ships.

const WEB = join(import.meta.dirname, "..");

/** Literal hrefs to this site that are files, not pages. */
const FILES = new Set(["/fonts/OFL.txt"]);

/** Each file's plain-<a> href expressions, and what they hold. */
const EXPRESSIONS: Record<string, Record<string, string>> = {
  "app/o-projekcie/page.tsx": {
    GMINA_NEWS: "another site",
    MZGKIM_NEWS: "another site",
    PGE_PAGE: "another site",
    TERYT_PAGE: "another site",
  },
  "app/prywatnosc/page.tsx": {
    VERCEL_PRIVACY: "another site",
    VERCEL_DPA: "another site",
    IMPROVMX_PRIVACY: "another site",
  },
  "components/contact-link.tsx": { CONTACT_HREF: "mailto:" },
  "components/imgw-source.tsx": { IMGW_PAGE: "another site" },
  "components/now-panel.tsx": {
    "source.href":
      "another site: a tile's source, in the source line (NOW_TILES)",
  },
  "components/site-footer.tsx": { CONTACT_HREF: "mailto:" },
  "components/subpage-parts.tsx": {
    href: "an ICS file (CalendarBlock)",
    "file.href": "the page's file (CalendarBlock): /smieci's PDF",
  },
  "components/parts.tsx": {
    "part.href": "another site: an href starting with / is a <Link>",
  },
  "components/place-page.tsx": {
    "place.schedulePage": "another site",
  },
};

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith(".tsx") ? [path] : [];
  });
}

/** Each plain <a>'s href in `code`: a "literal" or an {expression}. */
function plainHrefs(code: string): string[] {
  const hrefs: string[] = [];
  for (const { index } of code.matchAll(/<a\s/g)) {
    const at = code.indexOf("href=", index);
    assert.ok(at > 0 && !code.slice(index + 1, at).includes("<"), "an href");
    let end = at + 6;
    if (code[at + 5] === '"') {
      end = code.indexOf('"', end) + 1;
    } else {
      for (let depth = 1; depth > 0; end++) {
        if (code[end] === "{") depth++;
        if (code[end] === "}") depth--;
      }
    }
    hrefs.push(code.slice(at + 5, end));
  }
  return hrefs;
}

test("every plain <a> is another site, mailto: or a file", () => {
  const seen: string[] = [];
  for (const path of [
    ...sources(join(WEB, "app")),
    ...sources(join(WEB, "components")),
  ]) {
    const file = relative(WEB, path);
    for (const href of plainHrefs(readFileSync(path, "utf8"))) {
      seen.push(`${file} ${href}`);
      if (href.startsWith('"')) {
        const url = href.slice(1, -1);
        assert.ok(
          /^(https:\/\/|mailto:)/.test(url) || FILES.has(url),
          `${file}: <a href=${href}> is a page of the site: use <Link>`,
        );
      } else {
        const expression = href.slice(1, -1);
        assert.ok(
          EXPRESSIONS[file]?.[expression],
          `${file}: <a href=${href}>: a page of the site is a <Link>; another site, mailto: or a file goes in EXPRESSIONS`,
        );
      }
    }
  }
  // Every listed expression is still there, so the list stays true.
  for (const [file, expressions] of Object.entries(EXPRESSIONS)) {
    for (const expression of Object.keys(expressions)) {
      assert.ok(
        seen.includes(`${file} {${expression}}`),
        `${file} {${expression}}`,
      );
    }
  }
});

test("the in-page links are FragmentLinks, to ids", () => {
  for (const file of [
    "components/skip-link.tsx",
    "components/error-summary.tsx",
  ]) {
    const code = readFileSync(join(WEB, file), "utf8");
    assert.match(code, /<FragmentLink\b[^>]*\shref=/, file);
    assert.doesNotMatch(code, /<a\s/, file);
  }
  // The skip link, the body's first link, to the page's heading block
  // (components/skip-target.tsx), not to <main>.
  const layout = readFileSync(join(WEB, "app/layout.tsx"), "utf8");
  assert.match(layout, /<SkipLink \/>\s*<SiteHeader \/>/);
  assert.match(layout, /<main className="govuk-main-wrapper[^"]*">/);
});
