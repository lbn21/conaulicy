// The gmina PDF as Grok sees it: one page rendered by pdftoppm, nothing read
// from its text. Needs poppler-utils (CI installs it before the unit
// tests, and there a missing pdftoppm fails instead of skipping; the e2e,
// scripts/check-import-run.mjs, renders one too).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import PDFDocument from "pdfkit";
import { pdfBytes } from "../../lib/schedule-fixture.ts";
import { RENDER_TIMEOUT_MS, renderPdf } from "./adapters.ts";

const poppler = spawnSync("pdftoppm", ["-v"]).status === 0;

function pdf(pages: number): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A6" });
  const done = pdfBytes(doc);
  for (let i = 1; i < pages; i++) doc.addPage();
  doc.end();
  return done;
}

test("renderPdf: one page to one PNG; more pages or no PDF fail", {
  skip: !poppler && !process.env.CI && "pdftoppm is not installed",
}, async () => {
  const png = renderPdf(await pdf(1));
  assert.deepEqual(
    [...png.subarray(0, 8)],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  );
  const two = await pdf(2);
  assert.throws(() => renderPdf(two), /^Error: 2 pages, expected 1$/);
  assert.throws(
    () => renderPdf(Buffer.from("%PDF-1.4 not a schedule")),
    /^Error: pdftoppm cannot render it \(exit \d+\)$/,
  );
});

test("renderPdf: a pdftoppm that hangs is stopped at the timeout (60 s), with its message", () => {
  assert.equal(RENDER_TIMEOUT_MS, 60_000);
  // A pdftoppm that never finishes, first on PATH; the timeout shortened.
  const bin = mkdtempSync(path.join(tmpdir(), "hanging-pdftoppm-"));
  writeFileSync(path.join(bin, "pdftoppm"), "#!/bin/sh\nexec sleep 30\n", {
    mode: 0o755,
  });
  const before = process.env.PATH;
  process.env.PATH = `${bin}:${before}`;
  try {
    assert.throws(
      () => renderPdf(Buffer.from("%PDF-1.4"), 200),
      /^Error: pdftoppm did not finish within 0\.2 s$/,
    );
  } finally {
    process.env.PATH = before;
  }
});
