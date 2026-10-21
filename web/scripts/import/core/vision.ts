// Vision passes for every importer: the Cursor CLI reads an image in an
// empty, locked-down workspace, once per vision.passes entry: each pass is a
// fresh agent (no resume, its own workspace), so the reads are independent;
// they run at the same time. The reply's JSON is taken out of any prose
// around it. What the JSON means, and whether the passes agree, is the
// domain's business.
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Config } from "./config.ts";

/**
 * The first balanced top-level JSON object in a model's reply, which may wrap
 * it in prose or a ```json fence. Braces inside strings (and escaped quotes)
 * do not count. Throws if there is none.
 */
export function extractJson(text: string): string {
  const start = text.indexOf("{");
  if (start < 0) throw new Error("no JSON object in the reply");
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  throw new Error("the JSON object in the reply is not closed");
}

/**
 * The raw text of each pass (CURSOR_AGENT_MOCK: files instead, for tests).
 * ext: the source file's extension (".jpg"), which the image keeps.
 */
export async function visionPasses(
  config: Config,
  body: Buffer,
  ext: string,
  prompt: (image: string) => string,
  mockName: string,
): Promise<string[]> {
  const passes = config.vision.passes;
  const mock = process.env.CURSOR_AGENT_MOCK;
  if (mock)
    return passes.map((_, i) => {
      const f = path.join(mock, `${mockName}.pass-${i + 1}.json`);
      if (!existsSync(f)) throw new Error(`mock pass ${i + 1} missing`);
      return readFileSync(f, "utf8");
    });
  if (!process.env.CURSOR_API_KEY)
    throw new Error(
      "CURSOR_API_KEY is not set, so the city JPG cannot be read automatically (repository secret).",
    );
  // The account's models (`agent models`; older builds: --list-models).
  let listing = spawnSync("agent", ["models"], {
    encoding: "utf8",
    timeout: 120_000,
  });
  if (listing.status !== 0)
    listing = spawnSync("agent", ["--list-models"], {
      encoding: "utf8",
      timeout: 120_000,
    });
  if (listing.status !== 0)
    throw new Error(
      `cannot list the Cursor models (exit ${listing.status}): ${(listing.stderr || listing.stdout || String(listing.error ?? "")).trim().slice(0, 300)}`,
    );
  const available = new Set(
    listing.stdout.match(/[a-z0-9][a-z0-9.-]*[a-z0-9]/g) ?? [],
  );
  for (const p of passes)
    if (!available.has(p.model))
      throw new Error(
        `model ${p.model} (pass ${p.id}) is not available to this Cursor account; update vision.passes in etl/sources.yaml. Available: ${[
          ...available,
        ]
          .filter((m) => /\d/.test(m))
          .join(", ")
          .slice(0, 1500)}`,
      );
  // All passes at once. A failed pass fails the file with the first failure
  // in pass order, as when they ran one after another.
  const image = `source${ext.toLowerCase()}`;
  const results = await Promise.allSettled(
    passes.map((pass) => runPass(pass, body, image, prompt)),
  );
  for (const result of results)
    if (result.status === "rejected") throw result.reason;
  return results.map((r) => (r as PromiseFulfilledResult<string>).value);
}

/** One pass: a fresh agent in its own workspace; its reply's text. */
function runPass(
  pass: Config["vision"]["passes"][number],
  body: Buffer,
  image: string,
  prompt: (image: string) => string,
): Promise<string> {
  // An empty workspace holding only the image; the agent may read it and
  // nothing else (no shell, writes, web or MCP). Everything else (git, DB,
  // S3, issues) is done by this script, never by the agent.
  const work = mkdtempSync(path.join(tmpdir(), `vision-${pass.id}-`));
  writeFileSync(path.join(work, image), body);
  mkdirSync(path.join(work, ".cursor"));
  writeFileSync(
    path.join(work, ".cursor/cli.json"),
    JSON.stringify({
      permissions: {
        allow: [`Read(${image})`],
        deny: ["Shell(*)", "Write(**)", "WebFetch(*)", "Mcp(*:*)"],
      },
    }),
  );
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const agent = spawn(
      "agent",
      [
        "-p",
        "--output-format",
        "json",
        "--mode",
        "ask",
        "--trust",
        "--workspace",
        work,
        "--model",
        pass.model,
        prompt(`./${image}`),
      ],
      // stdin at EOF, as spawnSync gave it: the CLI must not wait on it.
      { cwd: work, timeout: 15 * 60_000, stdio: ["ignore", "pipe", "pipe"] },
    );
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    agent.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    agent.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    agent.on("error", reject);
    agent.on("close", (code) => {
      console.log(
        `  vision pass ${pass.id}: exit ${code} after ${Math.round((Date.now() - started) / 1000)}s`,
      );
      if (code !== 0)
        return reject(
          new Error(
            `pass ${pass.id} (${pass.model}): agent exited ${code}: ${Buffer.concat(stderr).toString("utf8").slice(0, 300)}`,
          ),
        );
      try {
        // Any prose or fence around the JSON is dropped by extractJson.
        const reply = JSON.parse(Buffer.concat(stdout).toString("utf8")) as {
          result?: unknown;
        };
        resolve(String(reply.result ?? ""));
      } catch (error) {
        reject(error);
      }
    });
  });
}
