// Archives a downloaded file in the private S3 bucket (etl/sources.yaml
// archive), under sources/<origin>/<date>/<file>; ARCHIVE_DIR replaces S3 in
// tests. Shared by the import (run.ts) and the TERYT check.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Config } from "./config.ts";

export function archive(
  config: Config,
  key: string,
  body: Buffer,
  digest: string,
) {
  if (process.env.ARCHIVE_DIR) {
    const target = path.join(process.env.ARCHIVE_DIR, key);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, body);
    return;
  }
  const file = path.join(mkdtempSync(path.join(tmpdir(), "archive-")), "body");
  writeFileSync(file, body);
  const { bucket, region } = config.archive;
  execFileSync(
    "aws",
    [
      "s3api",
      "put-object",
      "--bucket",
      bucket,
      "--region",
      region,
      "--key",
      key,
      "--body",
      file,
      "--metadata",
      `sha256=${digest}`,
    ],
    { stdio: "ignore" },
  );
}
