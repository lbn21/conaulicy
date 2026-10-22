// Unknown query parameters redirect (308) to the clean URL, so random query
// strings cannot bust the CDN cache (proxy.ts, lib/clean-query.ts). Allowed
// ones (nr on street pages and PDFs, q on /api/search) are served as they
// are; Next.js assets, icons with their cache-busting query, other files and
// POST /api/revalidate are never redirected.
//
// Runs against `next start` on the current build and the CI fixture.
import { startServer } from "./lib/server.mjs";

const STREET = "/adres/0972447-00470";
const SPLIT = "/adres/0972447-90004";

// [method, path, status, clean path + query for a redirect]
const CASES = [
  ["GET", `${STREET}?x=1`, 308, STREET],
  ["GET", `${STREET}?nr=12&x=1`, 308, `${STREET}?nr=12`],
  ["GET", `${STREET}?nr=12`, 200],
  ["GET", `${SPLIT}?nr=`, 200],
  [
    "GET",
    `${SPLIT}/harmonogram.pdf?nr=7a&x=1`,
    308,
    `${SPLIT}/harmonogram.pdf?nr=7a`,
  ],
  ["GET", `${STREET}/harmonogram.pdf?x=1`, 308, `${STREET}/harmonogram.pdf`],
  ["GET", "/api/search?q=asn", 200],
  ["GET", "/api/search?q=asn&x=1", 308, "/api/search?q=asn"],
  ["GET", "/?fbclid=1", 308, "/"],
  ["HEAD", "/ulice?utm_source=fb", 308, "/ulice"],
  ["POST", "/api/revalidate?x=1", 401],
  ["GET", "/manifest.webmanifest?x=1", 200],
  ["GET", "/robots.txt?x=1", 200],
];

const server = await startServer(3308);
const failures = [];

try {
  const home = await (await fetch(`${server.origin}/`)).text();
  const chunk = /\/_next\/static\/[^"]+\.js/.exec(home)?.[0];
  if (chunk) CASES.push(["GET", `${chunk}?x=1`, 200]);
  else failures.push("/: no /_next/static/ script");

  // Next.js links its icons with a cache-busting query.
  for (const name of ["favicon.ico", "icon.svg", "apple-icon.png"]) {
    const icon = home
      .match(/<link [^>]*>/g)
      ?.filter((tag) => /rel="(?:icon|apple-touch-icon)"/.test(tag))
      .map((tag) => /href="([^"]+)"/.exec(tag)?.[1])
      .find((href) => href?.startsWith(`/${name}?`));
    if (icon) CASES.push(["GET", icon, 200]);
    else failures.push(`/: no <link> to /${name}?…`);
  }

  const street = await (await fetch(`${server.origin}${STREET}`)).text();
  const ics = /href="(\/ics\/[^"?]+)"/.exec(street)?.[1];
  if (ics) CASES.push(["GET", `${ics}?x=1`, 308, ics]);
  else failures.push(`${STREET}: no /ics/ link`);

  for (const [method, path, status, clean] of CASES) {
    const response = await fetch(`${server.origin}${path}`, {
      method,
      redirect: "manual",
    });
    await response.arrayBuffer();
    const location = response.headers.get("location");
    const at = location && new URL(location, server.origin);
    const got =
      at &&
      `${at.origin === server.origin ? "" : at.origin}${at.pathname}${at.search}`;
    if (response.status !== status || (clean ?? null) !== (got ?? null)) {
      failures.push(
        `${method} ${path}: ${response.status} → ${location}, want ${status}${clean ? ` → ${clean}` : ""}`,
      );
    }
    if (path === "/api/search?q=asn" && response.status === 200) {
      const type = response.headers.get("content-type") ?? "";
      if (!type.includes("json")) failures.push(`${path}: ${type}`);
    }
  }
} finally {
  server.stop();
}

if (failures.length > 0) {
  console.log(failures.map((f) => `FAIL  ${f}`).join("\n"));
  process.exit(1);
}
console.log(
  `Query parameters: ${CASES.length} cases; unknown ones redirect to the clean URL, allowed ones and assets served.`,
);
// The server's output pipes would otherwise keep Node alive (as in check-a11y).
process.exit(0);
