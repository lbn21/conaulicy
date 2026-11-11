// What the live feeds' dev mocks share (lib/imgw-mock.ts, lib/pge-mock.ts):
// a broken upstream, and the store's two files as a good cron run left
// them. Development and preview only; each mock refuses production itself.
import { isoWithOffset } from "./dates.ts";
import { nextChecks } from "./live-status.ts";

/** fail=<status>|html|timeout: a broken upstream (any other value: 500). */
export function mockFailure(kind: string, signal?: AbortSignal | null) {
  switch (kind) {
    case "html":
      return Promise.resolve(
        new Response("<!DOCTYPE html><title>Błąd</title>", {
          headers: { "Content-Type": "text/html" },
        }),
      );
    case "timeout":
      return new Promise<Response>((_, reject) =>
        signal?.addEventListener("abort", () => reject(signal.reason)),
      );
    default:
      return Promise.resolve(new Response("", { status: Number(kind) || 500 }));
  }
}

/**
 * The store's two files for the pages (lib/live-store.ts), as a good cron
 * run `checkedAgo` minutes before `now` (default 0) would have left them:
 * `feedAt`'s file (fetched as at that run), and that run's check of `key`.
 * A mock that fails throws: a store that cannot be read.
 */
export async function mockLiveFiles(
  url: string,
  now: number,
  key: string,
  feedAt: (checkedAt: number) => Promise<string>,
): Promise<{ feed: string; checks: string }> {
  const ago = Number(new URL(url).searchParams.get("checkedAgo") ?? 0);
  const checkedAt = now - ago * 60_000;
  return {
    feed: await feedAt(checkedAt),
    checks: JSON.stringify(
      nextChecks(null, { [key]: true }, isoWithOffset(checkedAt)),
    ),
  };
}
