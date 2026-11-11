import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanQuery } from "./clean-query.ts";

const clean = (url: string) => {
  const { pathname, searchParams } = new URL(url, "https://conaulicy.pl");
  return cleanQuery(pathname, searchParams);
};

test("the street page, its PDF, water calendar and module subpages keep only nr", () => {
  const cases: Array<[string, string | null]> = [
    // The street page.
    ["/adres/X?x=1", ""],
    ["/adres/X?nr=12&x=1", "?nr=12"],
    ["/adres/X?x=1&nr=12", "?nr=12"],
    ["/adres/X?nr=12", null],
    ["/adres/X?nr=7/22", null],
    ["/adres/X?nr=", null],
    ["/adres/X?nr=&x=1", "?nr="],
    ["/adres/X?nr=1&nr=2", "?nr=1"],
    // The PDF, re-encoded.
    ["/adres/X/harmonogram.pdf?nr=7%2F22&utm_source=a", "?nr=7%2F22"],
    ["/adres/X/harmonogram.pdf?nr=7a", null],
    // The water calendar.
    ["/adres/X/woda.ics?nr=7a&utm_source=a", "?nr=7a"],
    ["/adres/X/woda.ics?nr=7a", null],
    ["/adres/X/woda.ics?x=1", ""],
    // A module subpage, as the street page.
    ["/adres/X/smieci?x=1", ""],
    ["/adres/X/smieci?nr=12&x=1", "?nr=12"],
    ["/adres/X/smieci?nr=7/22", null],
    ["/adres/X/smieci?nr=", null],
  ];
  for (const [url, expected] of cases) assert.equal(clean(url), expected, url);
});

test("an address page keeps ?imgw= outside production", () => {
  assert.equal(clean("/adres/X?imgw=2"), null);
  assert.equal(clean("/adres/X?nr=12&imgw=3,1&x=1"), "?nr=12&imgw=3%2C1");
  // The address pages' one rule (ADDRESS): a subpage keeps it too and
  // ignores it; no file or calendar takes it.
  assert.equal(clean("/adres/X/smieci?imgw=2"), null);
  assert.equal(clean("/adres/X/harmonogram.pdf?imgw=2"), "");
  assert.equal(clean("/adres/X/woda.ics?imgw=2"), "");
});

test("in production, ?imgw= is dropped like any unknown parameter", async () => {
  const before = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = "production";
  try {
    // A fresh copy of the module, read with production's environment.
    const fresh = new URL("./clean-query.ts?production", import.meta.url);
    const { cleanQuery: prod }: typeof import("./clean-query.ts") =
      await import(fresh.href);
    const at = (url: string) => {
      const { pathname, searchParams } = new URL(url, "https://conaulicy.pl");
      return prod(pathname, searchParams);
    };
    assert.equal(at("/adres/X?imgw=2"), "");
    assert.equal(at("/adres/X?nr=12&imgw=2"), "?nr=12");
    assert.equal(at("/adres/X?nr=12"), null);
  } finally {
    if (before === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = before;
  }
});

test("the search API keeps only q, empty included", () => {
  const cases: Array<[string, string | null]> = [
    ["/api/search?q=", null],
    ["/api/search?q=asn", null],
    ["/api/search?q=asn&x=1", "?q=asn"],
  ];
  for (const [url, expected] of cases) assert.equal(clean(url), expected, url);
});

test("the other cacheable routes take no parameters", () => {
  assert.equal(clean("/?x=1"), "");
  assert.equal(clean("/ulice?utm_source=fb"), "");
  assert.equal(clean("/dostepnosc?x=1"), "");
  assert.equal(clean("/prywatnosc?x=1"), "");
  assert.equal(clean("/o-projekcie?x=1"), "");
  assert.equal(clean("/ics/Z?x=1"), "");
  assert.equal(clean("/api/search-index/abc?x=1"), "");
  assert.equal(clean("/api/place-redirects?x=1"), "");
});

test("files, metadata and unknown paths are never touched", () => {
  assert.equal(clean("/favicon.ico?favicon.2zyqv1b-1_vd2.ico"), null);
  assert.equal(clean("/icon.svg?icon.0otmg08cw9-wb.svg"), null);
  assert.equal(clean("/apple-touch-icon.png?x=1"), null);
  assert.equal(clean("/manifest.webmanifest?x=1"), null);
  assert.equal(clean("/og.png?x=1"), null);
  assert.equal(clean("/robots.txt?x=1"), null);
  assert.equal(clean("/sitemap.xml?x=1"), null);
  assert.equal(clean("/nie-ma-takiej-strony?x=1"), null);
  assert.equal(clean("/adres/X/cos-innego?x=1"), null);
  // The old number paths are no route of ours: a plain 404.
  assert.equal(clean("/adres/X/nr/12?x=1"), null);
  assert.equal(clean("/adres/X/numer?x=1"), null);
});

test("no query, nothing to do", () => {
  assert.equal(clean("/"), null);
  assert.equal(clean("/adres/X"), null);
  assert.equal(clean("/api/search"), null);
  assert.equal(clean("/api/place-redirects"), null);
});

test("internal paths are never touched", () => {
  assert.equal(clean("/_next/static/chunks/a.js?x=1"), null);
  assert.equal(clean("/_next/image?url=a&w=1"), null);
  assert.equal(clean("/_vercel/insights/script.js?x=1"), null);
  assert.equal(clean("/.well-known/security.txt?x=1"), null);
  assert.equal(clean("/api/revalidate?x=1"), null);
});

test("an unknown module is not a route of ours", () => {
  assert.equal(clean("/adres/X/prad?x=1"), null);
});
