// HTTP for every importer: GET with retries and backoff (import.retries).
import type { Config } from "./config.ts";

const UA = "conaulicy-import (+https://conaulicy.pl)";

export type Http = { get(url: string): Promise<Response> };

/** GET with retries and doubling backoff on network errors, 429 and 5xx. */
export function http(retries: Config["import"]["retries"]): Http {
  return {
    async get(url) {
      let last: Error = new Error(`GET ${url}: no attempt`);
      for (let attempt = 1; attempt <= retries.attempts; attempt++) {
        try {
          const response = await fetch(url, {
            headers: { "User-Agent": UA },
            signal: AbortSignal.timeout(60_000),
          });
          if (response.ok) return response;
          last = new Error(`GET ${url}: HTTP ${response.status}`);
          if (response.status !== 429 && response.status < 500) throw last;
        } catch (error) {
          last = error as Error;
          if (/HTTP 4\d\d/.test(last.message) && !/HTTP 429/.test(last.message))
            throw last;
        }
        if (attempt < retries.attempts) {
          const wait = retries.backoffSeconds * 1000 * 2 ** (attempt - 1);
          console.log(
            `  retry ${attempt}/${retries.attempts - 1} in ${wait / 1000}s: ${last.message}`,
          );
          await new Promise((resolve) => setTimeout(resolve, wait));
        }
      }
      throw last;
    },
  };
}
