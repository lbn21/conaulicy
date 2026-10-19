// Takes the preview screenshots with headless Chrome via the DevTools protocol.
// Run: node design/proposals/shoot.mjs
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9333;
const SLUGS = ["latarnia", "bez"];
const SHOTS = [
  { name: "360-dark", w: 360, h: 740, q: "?theme=dark" },
  { name: "360-light", w: 360, h: 740, q: "?theme=light" },
  { name: "1280-dark", w: 1280, h: 900, q: "?theme=dark" },
  { name: "1280-light", w: 1280, h: 900, q: "?theme=light" },
  { name: "360-dark-text200", w: 360, h: 2200, q: "?theme=dark&text=200" },
];

const profile = mkdtempSync(join(tmpdir(), "conaulicy-shoot-"));
const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
  "--no-default-browser-check", `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`,
  "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(200);
  }
  throw new Error("Chrome did not start");
}

const ws = new WebSocket(await target());
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const pending = new Map();
const waiters = [];
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
  } else if (msg.method) {
    for (const w of waiters.splice(0)) if (w.method === msg.method) w.resolve(); else waiters.push(w);
  }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const n = ++id;
  pending.set(n, { resolve, reject });
  ws.send(JSON.stringify({ id: n, method, params }));
});
const once = (method) => new Promise((resolve) => waiters.push({ method, resolve }));

await send("Page.enable");
for (const slug of SLUGS) {
  for (const s of SHOTS) {
    await send("Emulation.setDeviceMetricsOverride", {
      width: s.w, height: s.h, deviceScaleFactor: 1, mobile: s.w < 600,
    });
    const loaded = once("Page.loadEventFired");
    await send("Page.navigate", { url: pathToFileURL(join(ROOT, slug, "index.html")).href + s.q });
    await loaded;
    await send("Runtime.evaluate", { expression: "document.fonts.ready.then(() => true)", awaitPromise: true });
    await sleep(150);
    const { result } = await send("Runtime.evaluate", {
      expression: `JSON.stringify({
        sw: document.documentElement.scrollWidth,
        cta: Math.round(document.querySelector('.cta').getBoundingClientRect().bottom),
        wide: [...document.querySelectorAll('body *')]
          .filter(e => !e.closest('.scroll') && e.getBoundingClientRect().right > innerWidth + 1)
          .slice(0, 4).map(e => e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right)),
        fonts: [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight).join(', ')
      })`,
    });
    const shot = await send("Page.captureScreenshot", {
      format: "png", clip: { x: 0, y: 0, width: s.w, height: s.h, scale: 1 },
    });
    writeFileSync(join(ROOT, slug, `${s.name}.png`), Buffer.from(shot.data, "base64"));
    console.log(slug, s.name, result.value);
  }
}
ws.close();
chrome.kill();
await sleep(300);
rmSync(profile, { recursive: true, force: true });
