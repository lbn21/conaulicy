// The prompts are Jakub's, sent exactly as in the dry run (task 191): a
// change to the instruction text or to the TERYT snapshot's places fails
// here on purpose; a new prompt needs a new dry run.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { INSTRUCTIONS, listedPlaces, schedulePrompt } from "./prompts.ts";

const sha256 = (text: string) =>
  createHash("sha256").update(text).digest("hex");

test("prompts: the instruction parts, verbatim (pinned)", () => {
  assert.equal(Buffer.byteLength(INSTRUCTIONS.gmina), 2049);
  assert.equal(
    sha256(INSTRUCTIONS.gmina),
    "19441acc49dba046bfd1c1b365a8e71e0f8c4d280ca90905afd323e97f227230",
  );
  assert.equal(Buffer.byteLength(INSTRUCTIONS.miasto), 2637);
  assert.equal(
    sha256(INSTRUCTIONS.miasto),
    "6a444bada9bdf2ce5fc645a516c4b5eb509f02233bd923eaf0207638a1b887a8",
  );
});

test("prompts: assembled from the current TERYT snapshot, as sent (pinned)", () => {
  const gmina = schedulePrompt("gmina");
  assert.equal(Buffer.byteLength(gmina.text), 2507);
  assert.equal(
    sha256(gmina.text),
    "f590a0ac57381c30557b642df4183c7515c977031451f95cb3f58ed1bb532948",
  );
  const miasto = schedulePrompt("miasto");
  assert.equal(Buffer.byteLength(miasto.text), 7929);
  assert.equal(
    sha256(miasto.text),
    "020aad1aa670e3f9fbd84cff7ed8c2d5d94037a8ad4f5c7b9f2a96d5004de1eb",
  );
});

test("prompts: the listed places and the ids the model may answer", () => {
  const villages = listedPlaces("gmina");
  assert.equal(villages.length, 24);
  // Dąbrowa the village is listed, Dąbrowa the part of Basznia Górna is not.
  assert.ok(villages.some((p) => p.line === "0606010 Dąbrowa\n"));
  assert.ok(!villages.some((p) => p.id === "0605967"));
  const streets = listedPlaces("miasto");
  assert.equal(streets.length, 206);
  assert.ok(streets.some((p) => p.line === "00470 ul. Adama Asnyka\n"));
  assert.deepEqual(
    schedulePrompt("miasto").ids,
    streets.map((p) => p.id),
  );
});
