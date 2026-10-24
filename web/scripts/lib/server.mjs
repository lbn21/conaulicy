// Starts the production server (`next start`) for the checks and lists the
// routes they cover, and ends a check (finish). Run `next build` first.
import { spawn } from "node:child_process";

// One of each kind of page. Keep in sync with the CI fixture (scripts/ci-fixture.ts).
export const ROUTES = [
  { path: "/", name: "home" },
  { path: "/adres/0972447-00470", name: "city-street" },
  { path: "/adres/0606010", name: "village" },
  { path: "/adres/0606234-90008", name: "village-street" },
  { path: "/adres/0972447-23434", name: "street-without-schedule" },
  { path: "/adres/0972447-90009", name: "street-schedule-ended" },
  { path: "/adres/0972447-90004", name: "split-street" },
  { path: "/adres/0972447-90004?nr=7a", name: "split-street-number" },
  { path: "/adres/0972447-90004?nr=42", name: "split-street-unknown-number" },
  { path: "/adres/0972447-90004?nr=", name: "split-street-missing-number" },
  { path: "/adres/0972447-00470?nr=12", name: "city-street-number" },
  { path: "/ulice", name: "all-places" },
  { path: "/prywatnosc", name: "privacy" },
  { path: "/dostepnosc", name: "accessibility" },
  { path: "/o-projekcie", name: "about" },
  { path: "/szukaj?q=adama", name: "search-results" },
  { path: "/szukaj?q=xyzqq", name: "search-none" },
  { path: "/szukaj?q=", name: "search-empty" },
  { path: "/nie-ma-takiej-strony", name: "not-found", status: 404 },
  { path: "/adres/9999999", name: "unknown-place", status: 404 },
];

export async function startServer(port = 3300) {
  // The pre-launch gate must be off, or every page is a 401. Empty, not
  // unset: Next's .env loading never overrides a set variable, so a local
  // .env.local cannot turn it back on.
  const env = { ...process.env, PORT: String(port), SITE_BASIC_AUTH: "" };
  const child = spawn("npx", ["next", "start", "-p", String(port)], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (chunk) => {
    log += chunk;
  });
  child.stderr.on("data", (chunk) => {
    log += chunk;
  });

  const origin = `http://localhost:${port}`;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      await fetch(origin);
      return {
        origin,
        stop: () => child.kill("SIGTERM"),
      };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  child.kill("SIGTERM");
  throw new Error(`next start did not answer on ${origin}.\n${log}`);
}

// A check's ending: its FAIL lines and exit 1, or its summary and exit 0
// (the server's output pipes would otherwise keep Node alive).
export function finish(failures, summary) {
  if (failures.length > 0) {
    console.log(failures.map((f) => `FAIL  ${f}`).join("\n"));
    process.exit(1);
  }
  console.log(summary);
  process.exit(0);
}

// The search field's index that a home page's HTML links
// (/api/search-index/<hash>): its URL, and its [id, label, type] rows, none
// when the page links no index.
export async function searchIndexOf(origin, home) {
  const url = /\/api\/search-index\/[\da-f]+/.exec(home)?.[0];
  const places = url ? await (await fetch(`${origin}${url}`)).json() : [];
  return { url, places };
}
