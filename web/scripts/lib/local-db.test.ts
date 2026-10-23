import assert from "node:assert/strict";
import { test } from "node:test";
import { databaseUrl } from "./local-db.ts";

test("databaseUrl: IMPORT_DATABASE_URL, then UNPOOLED, then DATABASE_URL", () => {
  const all = {
    IMPORT_DATABASE_URL: "postgres://import",
    DATABASE_URL_UNPOOLED: "postgres://unpooled",
    DATABASE_URL: "postgres://pooled",
  };
  assert.equal(databaseUrl(all), "postgres://import");
  assert.equal(
    databaseUrl({ ...all, IMPORT_DATABASE_URL: undefined }),
    "postgres://unpooled",
  );
  assert.equal(
    databaseUrl({ DATABASE_URL: "postgres://pooled" }),
    "postgres://pooled",
  );
});

test("databaseUrl: an empty variable falls through; none is undefined", () => {
  assert.equal(
    databaseUrl({
      IMPORT_DATABASE_URL: "",
      DATABASE_URL_UNPOOLED: "",
      DATABASE_URL: "postgres://pooled",
    }),
    "postgres://pooled",
  );
  assert.equal(databaseUrl({ DATABASE_URL: "" }), undefined);
  assert.equal(databaseUrl({}), undefined);
});
