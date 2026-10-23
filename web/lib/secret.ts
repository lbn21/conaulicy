import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/**
 * A secret compared in constant time. Hashing first gives equal-length
 * buffers, so the compare time does not depend on where the strings differ
 * or on their lengths.
 */
export function sameSecret(given: string, expected: string): boolean {
  return timingSafeEqual(digest(given), digest(expected));
}
