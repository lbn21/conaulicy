import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { test } from "node:test";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import {
  ADDRESS,
  ADDRESS_VARIANTS,
  addressPage,
  FILE_NAMES,
  isModuleId,
  MODULE_IDS,
  NUMBER_REWRITES,
  numberErrorPath,
  numberParam,
  numberRedirects,
  RESERVED_SEGMENTS,
  SUBPAGE_IDS,
} from "./address-routes.ts";

test("waste first, then water, then weather; the weather has no subpage", () => {
  assert.deepEqual(MODULE_IDS, ["smieci", "woda", "pogoda"]);
  assert.equal(MODULE_IDS[0], "smieci");
  assert.deepEqual(SUBPAGE_IDS, ["smieci", "woda"]);
  for (const id of SUBPAGE_IDS) assert.ok(isModuleId(id), id);
});

test("module ids are unique", () => {
  assert.equal(new Set(MODULE_IDS).size, MODULE_IDS.length);
});

test("no module is called nr, numer or like another folder", () => {
  for (const id of MODULE_IDS) {
    assert.ok(!["nr", "numer"].includes(id), id);
    assert.ok(!RESERVED_SEGMENTS.includes(id), id);
  }
  assert.equal(isModuleId("nr"), false);
  assert.equal(isModuleId("numer"), false);
  assert.equal(isModuleId("harmonogram.pdf"), false);
  assert.equal(isModuleId("smieci"), true);
  assert.equal(isModuleId("pogoda"), true);
  assert.equal(isModuleId("woda"), true);
  assert.equal(isModuleId("prad"), false);
});

test("module ids are plain path segments", () => {
  for (const id of MODULE_IDS) assert.match(id, /^[a-z]+$/);
});

test("the street page and a module subpage take ?nr=", () => {
  assert.ok(ADDRESS.test("/adres/0972447-00470"));
  assert.ok(ADDRESS.test("/adres/0972447-00470/"));
  assert.ok(ADDRESS.test("/adres/0972447-00470/smieci"));
  assert.ok(ADDRESS.test("/adres/0972447-00470/smieci/"));
  assert.ok(ADDRESS.test("/adres/0972447-00470/woda"));
  assert.ok(!ADDRESS.test("/adres/0972447-00470/prad"));
  // A module without a subpage takes no ?nr= (its URL is a 404).
  assert.ok(!ADDRESS.test("/adres/0972447-00470/pogoda"));
  assert.ok(!ADDRESS.test("/adres/0972447-00470/numer"));
  assert.ok(!ADDRESS.test("/adres/0972447-00470/harmonogram.pdf"));
  assert.ok(!ADDRESS.test("/adres/0972447-00470/woda.ics"));
  assert.ok(!ADDRESS.test("/adres"));
});

test("their number and error variants", () => {
  const variant = (path: string) =>
    ADDRESS_VARIANTS.some((re) => re.test(path));
  assert.ok(variant("/adres/X/nr/12"));
  assert.ok(variant("/adres/X/nr/7/22"));
  assert.ok(variant("/adres/X/numer"));
  assert.ok(variant("/adres/X/smieci/nr/12a"));
  assert.ok(variant("/adres/X/smieci/nr/7/22"));
  assert.ok(variant("/adres/X/smieci/numer"));
  assert.ok(!variant("/adres/X/nr"));
  assert.ok(variant("/adres/X/woda/nr/12"));
  assert.ok(variant("/adres/X/woda/numer"));
  assert.ok(!variant("/adres/X/prad/nr/12"));
  assert.ok(!variant("/adres/X/pogoda/nr/12"));
  assert.ok(!variant("/adres/X/pogoda/numer"));
  assert.ok(!variant("/adres/X/smieci"));
});

test("a valid ?nr= becomes a path, for the street page and a module; any other, the error variant", () => {
  assert.deepEqual(
    NUMBER_REWRITES.map(({ source, destination }) => [source, destination]),
    [
      ["/adres/:id", "/adres/:id/nr/:nr"],
      ["/adres/:id/:module(smieci|woda)", "/adres/:id/:module/nr/:nr"],
    ],
  );
  for (const rule of NUMBER_REWRITES) {
    assert.equal(rule.has.length, 1);
    const [has] = rule.has;
    assert.equal(has.type, "query");
    assert.equal(has.key, "nr");
    const value = new RegExp(`^${has.value}$`);
    for (const nr of ["12", "12a", "12A", "7/22", "12/14b"]) {
      assert.ok(value.test(nr), nr);
    }
    for (const nr of ["", "abc", "12 a", "12345", "1/2/3"]) {
      assert.ok(!value.test(nr), nr);
    }
  }
  // Any other ?nr= goes to the page's own error variant.
  assert.equal(numberErrorPath("/adres/X"), "/adres/X/numer");
  assert.equal(numberErrorPath("/adres/X/"), "/adres/X/numer");
  assert.equal(numberErrorPath("/adres/X/smieci"), "/adres/X/smieci/numer");
  assert.equal(numberErrorPath("/adres/X/smieci/"), "/adres/X/smieci/numer");
  assert.equal(numberErrorPath("/adres/X/woda"), "/adres/X/woda/numer");
  assert.equal(numberErrorPath("/adres/X/prad"), null);
  assert.equal(numberErrorPath("/adres/X/numer"), null);
  assert.equal(numberErrorPath("/adres/X/nr/12"), null);
  assert.equal(numberErrorPath("/ulice"), null);
  // Any other value goes to the number variant, which checks and shows it.
  assert.equal(numberErrorPath("/adres/X", "abc"), "/adres/X/nr/abc");
  assert.equal(
    numberErrorPath("/adres/X/woda", " 44"),
    "/adres/X/woda/nr/%2044",
  );
  assert.equal(
    numberErrorPath("/adres/X/smieci", "+44"),
    "/adres/X/smieci/nr/%2B44",
  );
});

test("a /nr/ path's value: decoded, its segments joined", () => {
  assert.equal(numberParam(["%2B44"]), "+44");
  assert.equal(numberParam(["%2044"]), " 44");
  assert.equal(numberParam(["7", "22"]), "7/22");
  assert.equal(numberParam(["50a"]), "50a");
  assert.equal(numberParam(["%E0%A4%A"]), "%E0%A4%A");
});

test("a subpage or file after a house number goes to the base address's one", () => {
  const module = ":module(smieci|woda|harmonogram\\.pdf|woda\\.ics)";
  assert.deepEqual(numberRedirects(), [
    {
      source: `/adres/:id/nr/:nr/${module}`,
      destination: "/adres/:id/:module?nr=:nr",
      permanent: true,
    },
    {
      source: `/adres/:id/nr/:nr/:flat/${module}`,
      destination: "/adres/:id/:module?nr=:nr/:flat",
      permanent: true,
    },
  ]);
});

test("the number redirects match as Next.js matches them", () => {
  const [plain, flat] = numberRedirects().map(({ source }) =>
    getPathMatch(source),
  );
  for (const name of [...SUBPAGE_IDS, ...FILE_NAMES]) {
    assert.deepEqual(
      { ...plain(`/adres/x/nr/50/${name}`) },
      { id: "x", nr: "50", module: name },
    );
    assert.deepEqual(
      { ...flat(`/adres/x/nr/7/22/${name}`) },
      { id: "x", nr: "7", flat: "22", module: name },
    );
    assert.equal(plain(`/adres/x/nr/7/22/${name}`), false, name);
  }
  // The dot is escaped: no other name, and the page's own number variants,
  // stay with the page.
  for (const path of [
    "/adres/x/nr/50/wodaXics",
    "/adres/x/nr/50/harmonogramXpdf",
    "/adres/x/nr/50",
    "/adres/x/nr/7/22",
    "/adres/x/nr/50/pogoda",
  ]) {
    assert.equal(plain(path), false, path);
    assert.equal(flat(path), false, path);
  }
});

test("every file route under app/adres/[id]/ has its number redirect", () => {
  const folders = readdirSync(new URL("../app/adres/[id]/", import.meta.url), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory() && entry.name.includes("."))
    .map((entry) => entry.name);
  assert.deepEqual(folders.toSorted(), [...FILE_NAMES].toSorted());
  for (const name of FILE_NAMES) assert.ok(RESERVED_SEGMENTS.includes(name));
});

test("the breadcrumbs' catch-all finds the address page in a path", () => {
  const id = "0972447-00470";
  assert.deepEqual(addressPage(["adres", id]), { id, module: null, nr: null });
  assert.deepEqual(addressPage(["adres", id, "numer"]), {
    id,
    module: null,
    nr: null,
  });
  assert.deepEqual(addressPage(["adres", id, "nr", "7", "22"]), {
    id,
    module: null,
    nr: "7/22",
  });
  assert.deepEqual(addressPage(["adres", id, "smieci"]), {
    id,
    module: "smieci",
    nr: null,
  });
  assert.deepEqual(addressPage(["adres", id, "smieci", "numer"]), {
    id,
    module: "smieci",
    nr: null,
  });
  assert.deepEqual(addressPage(["adres", id, "woda", "nr", "12a"]), {
    id,
    module: "woda",
    nr: "12a",
  });
  // Any other path: no breadcrumbs.
  assert.equal(addressPage([]), null);
  assert.equal(addressPage(["ulice"]), null);
  assert.equal(addressPage(["adres"]), null);
  assert.equal(addressPage(["adres", id, "nr"]), null);
  assert.equal(addressPage(["adres", id, "smieci", "inne"]), null);
  assert.equal(addressPage(["adres", id, "harmonogram.pdf"]), null);
});
