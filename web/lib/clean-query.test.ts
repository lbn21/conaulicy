import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanQuery } from "./clean-query.ts";

const clean = (url: string) => {
  const { pathname, searchParams } = new URL(url, "https://conaulicy.pl");
  return cleanQuery(pathname, searchParams);
};

test("a street page keeps only nr", () => {
  assert.equal(clean("/adres/X?x=1"), "");
  assert.equal(clean("/adres/X?nr=12&x=1"), "?nr=12");
  assert.equal(clean("/adres/X?x=1&nr=12"), "?nr=12");
  assert.equal(clean("/adres/X?nr=12"), null);
  assert.equal(clean("/adres/X?nr=7/22"), null);
  assert.equal(clean("/adres/X?nr="), null);
  assert.equal(clean("/adres/X?nr=&x=1"), "?nr=");
  assert.equal(clean("/adres/X?nr=1&nr=2"), "?nr=1");
});

test("a street PDF keeps only nr, re-encoded", () => {
  assert.equal(
    clean("/adres/X/harmonogram.pdf?nr=7%2F22&utm_source=a"),
    "?nr=7%2F22",
  );
  assert.equal(clean("/adres/X/harmonogram.pdf?nr=7a"), null);
});

test("the search API keeps only q", () => {
  assert.equal(clean("/api/search?q=asn"), null);
  assert.equal(clean("/api/search?q=asn&x=1"), "?q=asn");
});

test("every other route takes no parameters", () => {
  assert.equal(clean("/?x=1"), "");
  assert.equal(clean("/ulice?utm_source=fb"), "");
  assert.equal(clean("/ics/Z?x=1"), "");
  assert.equal(clean("/api/search-index/abc?x=1"), "");
  assert.equal(clean("/adres/X/numer?nr=1"), "");
  assert.equal(clean("/adres/X/nr/12?nr=1"), "");
  assert.equal(clean("/sitemap.xml?x=1"), "");
});

test("no query, nothing to do", () => {
  assert.equal(clean("/"), null);
  assert.equal(clean("/adres/X"), null);
  assert.equal(clean("/api/search"), null);
});

test("internal paths are never touched", () => {
  assert.equal(clean("/_next/static/chunks/a.js?x=1"), null);
  assert.equal(clean("/_next/image?url=a&w=1"), null);
  assert.equal(clean("/_vercel/insights/script.js?x=1"), null);
  assert.equal(clean("/.well-known/security.txt?x=1"), null);
  assert.equal(clean("/api/revalidate?x=1"), null);
});
