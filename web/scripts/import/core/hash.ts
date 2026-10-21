// SHA-256 as hex: source files, watched pages' links, issue keys.
import { createHash } from "node:crypto";

export const sha256 = (data: Buffer | string) =>
  createHash("sha256").update(data).digest("hex");
