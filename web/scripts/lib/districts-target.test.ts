import assert from "node:assert/strict";
import { test } from "node:test";
import { districtsTargetRefusal } from "./districts-target.ts";

const REMOTE = "postgres://u:p@ep-example-123456.eu-central-1.aws.neon.tech/db";
const dry = { apply: false, "yes-production": false };
const apply = { apply: true, "yes-production": false };
const yes = { apply: true, "yes-production": true };

test("districtsTargetRefusal: a local database, dry run or apply, anywhere", () => {
  for (const url of [
    "postgres://u:p@localhost:5432/db",
    "postgres://u:p@127.0.0.1:5432/db",
    "postgres://u:p@[::1]:5432/db",
  ])
    for (const args of [dry, apply])
      assert.equal(districtsTargetRefusal(url, args, {}), undefined);
});

test("districtsTargetRefusal: not local outside GitHub Actions, even a dry run", () => {
  for (const args of [dry, apply, yes]) {
    assert.match(
      districtsTargetRefusal(REMOTE, args, {}) ?? "",
      /not a local database/,
    );
    assert.ok(
      districtsTargetRefusal(REMOTE, args, { GITHUB_ACTIONS: "false" }),
    );
  }
});

test("districtsTargetRefusal: in GitHub Actions, --apply needs --yes-production", () => {
  const env = { GITHUB_ACTIONS: "true" };
  assert.equal(districtsTargetRefusal(REMOTE, dry, env), undefined);
  assert.match(
    districtsTargetRefusal(REMOTE, apply, env) ?? "",
    /--yes-production/,
  );
  assert.equal(districtsTargetRefusal(REMOTE, yes, env), undefined);
});

test("districtsTargetRefusal: never repeats the URL", () => {
  for (const args of [dry, apply])
    assert.ok(!districtsTargetRefusal(REMOTE, args, {})?.includes("neon.tech"));
});
