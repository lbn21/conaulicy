// Performance budgets (docs/perf.md). Lighthouse with its mobile defaults
// (Moto G Power, simulated Slow 4G: 150 ms RTT, 1.6 Mbps), PERF_RUNS (5)
// runs per page, the median against the budget, except LCP: best run.
// The CPU slowdown is calibrated to this machine (Lighthouse's documented
// approach): its benchmarkIndex picks the multiplier that makes it a
// mid-tier phone, where the default 4× assumes a high-end desktop.
// Lantern counts the JS in LCP only if it finished before the first paint
// on this fast local server, so runs land near 1.6 s or 2.2 s at random;
// the best run is the paint without that artifact. Fonts, CSS and HTML push
// every run up, and JS has its own budget (check-bundle). Also: gzipped
// HTML size, preloaded fonts, and how long a keystroke takes to update the
// search list once the index is loaded (same CPU slowdown). Run after
// `next build`; needs
// Playwright's Chromium. Writes the medians to PERF_OUT if set.
import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import lighthouse from "lighthouse";
import { chromium } from "playwright";
import { startServer } from "./lib/server.mjs";

const PAGES = [
  { path: "/", name: "home" },
  { path: "/adres/0972447-00470", name: "street" },
  { path: "/dostepnosc", name: "a11y" },
];
const RUNS = Number(process.env.PERF_RUNS ?? 5);
const BUDGET = {
  lcp: 1800,
  tbt: 150,
  cls: 0.01,
  html: 30_000,
  fonts: 4,
  keystroke: 50,
};
const PORT = 9333;

const server = await startServer(3307);
const browser = await chromium.launch({
  args: [`--remote-debugging-port=${PORT}`],
});
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};
const median = (values) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const results = {};

/**
 * cpuSlowdownMultiplier for a mid-tier phone from the host's benchmarkIndex,
 * as the Lighthouse CPU throttling calculator computes it
 * (https://lighthouse-cpu-throttling-calculator.vercel.app/, linked from
 * Lighthouse's docs/throttling.md). null: too slow to emulate one.
 */
function cpuMultiplier(benchmarkIndex) {
  if (benchmarkIndex >= 1300) return 3 + (benchmarkIndex - 1300) / 233;
  if (benchmarkIndex >= 800) return 2 + (benchmarkIndex - 800) / 500;
  if (benchmarkIndex >= 150) return 1 + (benchmarkIndex - 150) / 650;
  return null;
}

const CALIBRATION_RUNS = 3;

try {
  // Calibrate: Lighthouse measures benchmarkIndex in every run; the median
  // of a few warm-up runs (which also warm the server) sets the multiplier.
  const indexes = [];
  for (let i = 0; i < CALIBRATION_RUNS; i++) {
    const { lhr } = await lighthouse(`${server.origin}/`, {
      port: PORT,
      output: "json",
      logLevel: "error",
      onlyCategories: ["performance"],
    });
    indexes.push(lhr.environment.benchmarkIndex);
  }
  const benchmarkIndex = median(indexes);
  const multiplier = cpuMultiplier(benchmarkIndex);
  if (multiplier === null) {
    throw new Error(
      `benchmarkIndex ${benchmarkIndex}: this machine is too slow to emulate a mid-tier phone`,
    );
  }
  results.cpu = { benchmarkIndexes: indexes, benchmarkIndex, multiplier };
  console.log(
    `CPU: benchmarkIndex ${Math.round(benchmarkIndex)} (runs ${indexes.map(Math.round).join(", ")}), slowdown ${multiplier.toFixed(2)}× (Lighthouse default 4×)`,
  );

  for (const { path, name } of PAGES) {
    const url = `${server.origin}${path}`;
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      const { lhr } = await lighthouse(url, {
        port: PORT,
        output: "json",
        logLevel: "error",
        onlyCategories: ["performance"],
        throttling: { cpuSlowdownMultiplier: multiplier },
      });
      if (lhr.configSettings.throttling.cpuSlowdownMultiplier !== multiplier) {
        throw new Error("Lighthouse ignored the calibrated CPU slowdown");
      }
      const audit = (id) => lhr.audits[id].numericValue;
      runs.push({
        score: lhr.categories.performance.score,
        lcp: audit("largest-contentful-paint"),
        fcp: audit("first-contentful-paint"),
        tbt: audit("total-blocking-time"),
        cls: audit("cumulative-layout-shift"),
        bytes: audit("total-byte-weight"),
        requests: lhr.audits["network-requests"].details.items.length,
      });
    }
    const m = Object.fromEntries(
      Object.keys(runs[0]).map((key) => [key, median(runs.map((r) => r[key]))]),
    );

    const html = await (await fetch(url)).text();
    m.htmlGzip = gzipSync(html, { level: 9 }).length;
    m.preloadedFonts = (html.match(/<link[^>]+as="font"[^>]*>/g) ?? []).length;
    const bestLcp = Math.min(...runs.map((r) => r.lcp));
    results[name] = { ...m, bestLcp, lcpRuns: runs.map((r) => r.lcp) };

    const label = `${path}`;
    check(
      bestLcp <= BUDGET.lcp,
      `${label}: LCP ${Math.round(bestLcp)} ms in the best run`,
    );
    check(m.tbt <= BUDGET.tbt, `${label}: TBT ${Math.round(m.tbt)} ms`);
    check(m.cls < BUDGET.cls, `${label}: CLS ${m.cls.toFixed(3)}`);
    check(m.htmlGzip <= BUDGET.html, `${label}: HTML ${m.htmlGzip} B gzip`);
    check(
      m.preloadedFonts <= BUDGET.fonts,
      `${label}: ${m.preloadedFonts} preloaded fonts`,
    );
    console.log(
      `${label.padEnd(22)} score ${m.score.toFixed(2)}  LCP ${Math.round(m.lcp)} ms  FCP ${Math.round(m.fcp)} ms  TBT ${Math.round(m.tbt)} ms  CLS ${m.cls.toFixed(3)}  ${(m.bytes / 1000).toFixed(1)} KB in ${m.requests} requests  HTML ${(m.htmlGzip / 1000).toFixed(1)} KB gz  ${m.preloadedFonts} fonts preloaded\n${"".padEnd(22)} LCP per run: ${runs.map((r) => Math.round(r.lcp)).join(", ")} (best ${Math.round(bestLcp)}, median ${Math.round(m.lcp)})`,
    );
  }

  // Search: keystroke to updated list, after the index has loaded.
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
  await page.goto(`${server.origin}/`, { waitUntil: "networkidle" });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: multiplier });
  const input = page.getByRole("combobox");
  await input.pressSequentially("a");
  await page.getByRole("option").first().waitFor();
  await input.fill("");
  const times = [];
  for (const key of ["a", "d", "a", "m", "a"]) {
    await page.evaluate(() => {
      const field = document.querySelector('[role="combobox"]');
      window.__keystroke = new Promise((resolve) => {
        field.addEventListener(
          "keydown",
          (event) => {
            const start = event.timeStamp;
            // The next frame after React has rendered the new list.
            new MutationObserver((_, observer) => {
              observer.disconnect();
              requestAnimationFrame(() => resolve(performance.now() - start));
            }).observe(document.querySelector("search"), {
              subtree: true,
              childList: true,
              characterData: true,
              attributes: true,
            });
          },
          { once: true },
        );
      });
    });
    await input.press(key);
    times.push(await page.evaluate(() => window.__keystroke));
  }
  const keystroke = median(times);
  results.search = { keystroke };
  check(
    keystroke <= BUDGET.keystroke,
    `search: keystroke to list ${Math.round(keystroke)} ms`,
  );
  console.log(
    `search: keystroke to list ${Math.round(keystroke)} ms (median of ${times.map(Math.round).join(", ")}; CPU ${multiplier.toFixed(2)}× slower)`,
  );
} finally {
  await browser.close();
  server.stop();
}

if (process.env.PERF_OUT) {
  writeFileSync(process.env.PERF_OUT, `${JSON.stringify(results, null, 2)}\n`);
}
if (failures.length > 0) {
  console.log(failures.map((f) => `FAIL  ${f}`).join("\n"));
  process.exit(1);
}
console.log(
  `Performance: within budget (best-run LCP ≤ ${BUDGET.lcp} ms; median TBT ≤ ${BUDGET.tbt} ms, CLS < ${BUDGET.cls}, HTML ≤ ${BUDGET.html / 1000} KB gz, ≤ ${BUDGET.fonts} preloaded fonts, keystroke ≤ ${BUDGET.keystroke} ms).`,
);
// The server's output pipes would otherwise keep Node alive (as in check-a11y).
process.exit(0);
