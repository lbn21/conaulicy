// CI's Performance step only: check-perf.mjs, unchanged (same runs, same
// budgets), with one automatic re-run when it fails. Shared runners make TBT
// noisy, so one failed attempt alone does not fail the job; a second failure
// does. Both attempts' medians are printed side by side, so a real regression
// (both attempts high) stays visible. No other check is re-run.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "perf-"));
const PAGES = {
  home: "/",
  street: "/adres/0972447-00470",
  a11y: "/dostepnosc",
};

function attempt(n) {
  console.log(`\n── Performance, attempt ${n} of 2 ──`);
  const out = path.join(dir, `attempt-${n}.json`);
  const { status } = spawnSync(
    process.execPath,
    [path.join(import.meta.dirname, "check-perf.mjs")],
    { stdio: "inherit", env: { ...process.env, PERF_OUT: out } },
  );
  const medians = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : {};
  return { n, ok: status === 0, medians };
}

function summary(attempts) {
  console.log("\nMedians per attempt (LCP / TBT, ms):");
  for (const [name, page] of Object.entries(PAGES)) {
    const cells = attempts.map(({ n, medians }) => {
      const m = medians[name];
      return m
        ? `#${n} ${Math.round(m.lcp)} / ${Math.round(m.tbt)}`
        : `#${n} —`;
    });
    console.log(`  ${page.padEnd(22)} ${cells.join("   ")}`);
  }
  const keys = attempts.map(({ n, medians }) => {
    const k = medians.search?.keystroke;
    return `#${n} ${k === undefined ? "—" : Math.round(k)}`;
  });
  console.log(`  ${"keystroke".padEnd(22)} ${keys.join("   ")}`);
}

const first = attempt(1);
if (first.ok) process.exit(0);

console.log(
  process.env.GITHUB_ACTIONS
    ? "::warning title=Performance::Attempt 1 failed; re-running once. The job fails only if attempt 2 fails too."
    : "Attempt 1 failed; re-running once.",
);
const second = attempt(2);
summary([first, second]);
console.log(
  second.ok
    ? "Performance: attempt 2 within budget (attempt 1 failed; see above)."
    : "Performance: failed twice.",
);
process.exit(second.ok ? 0 : 1);
