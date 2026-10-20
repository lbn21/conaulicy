// npm run sources:pull: downloads the raw data sources archived in S3
// (etl/sources.yaml, archived; listed in docs/data/sources.md) from the private S3 bucket into .cache/sources/ (repo
// root, gitignored) and checks each file's SHA-256. For the ETL only: the
// build, CI and the site never need these files. Uses the AWS CLI and the
// caller's AWS credentials; files already cached with the right hash are
// skipped.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import path from "node:path";
import { archiveKey, loadConfig, ROOT } from "./config.ts";

const CACHE = path.join(ROOT, ".cache");
const { archive, archived } = loadConfig();
const files = archived.map((a) => ({ key: archiveKey(a), sha256: a.sha256 }));

const sha256Of = (file: string) =>
  createHash("sha256").update(readFileSync(file)).digest("hex");

let pulled = 0;
for (const { key, sha256 } of files) {
  const target = path.join(CACHE, key);
  if (existsSync(target) && sha256Of(target) === sha256) continue;
  mkdirSync(path.dirname(target), { recursive: true });
  const partial = `${target}.part`;
  execFileSync(
    "aws",
    [
      "s3api",
      "get-object",
      "--bucket",
      archive.bucket,
      "--region",
      archive.region,
      "--key",
      key,
      partial,
    ],
    { stdio: "ignore" },
  );
  const got = sha256Of(partial);
  if (got !== sha256) {
    throw new Error(`${key}: SHA-256 ${got}, expected ${sha256}`);
  }
  renameSync(partial, target);
  pulled++;
}
console.log(
  `Sources: ${files.length} in .cache/sources/ (${pulled} downloaded, ${files.length - pulled} already there), SHA-256 checked.`,
);
