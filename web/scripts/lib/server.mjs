// Starts the production server (`next start`) for the checks and lists the
// routes they cover. Run `next build` first.
import { spawn } from "node:child_process";

// One of each kind of page. Keep in sync with the fixture ids.
export const ROUTES = [
  { path: "/", name: "home" },
  { path: "/adres/0972447-00470", name: "city-street" },
  { path: "/adres/0606234", name: "village" },
  { path: "/adres/0972447-23434", name: "street-without-schedule" },
  { path: "/prywatnosc", name: "privacy" },
  { path: "/dostepnosc", name: "accessibility" },
  { path: "/nie-ma-takiej-strony", name: "not-found", status: 404 },
];

export async function startServer(port = 3300) {
  // The pre-launch gate must be off, or every page is a 401.
  const env = { ...process.env, PORT: String(port) };
  delete env.SITE_BASIC_AUTH;
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
