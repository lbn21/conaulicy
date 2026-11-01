// A link's full prefetch to an address, on intent (components/place-link.tsx,
// task 238). Imports only lib/module-ids.ts, so the link's chunk stays small.
import { SUBPAGE_IDS } from "./module-ids.ts";

/**
 * A canonical address page or module subpage, /adres/<id> or
 * /adres/<id>/<module>: no query, no trailing slash, no number or error
 * variant. Every one is prerendered at build.
 */
const CANONICAL = new RegExp(
  `^/adres/[^/?#]+(?:/(?:${SUBPAGE_IDS.join("|")}))?$`,
);

/**
 * The prefetch a <Link> to `href` takes once someone shows intent: with
 * Partial Prefetching, `true` fetches the page's own static content along
 * with the App Shell, so its h1 is there when the navigation commits
 * (nextjs.org/docs/app/api-reference/components/link#prefetch). Only for a
 * canonical page, which is static output: never a redirect source
 * (lib/address-routes.ts numberRedirects, proxy.ts's 308s, a trailing
 * slash) or a ?nr= rewritten to a number page rendered on its first visit.
 * Anything else keeps Next.js's default, the App Shell only.
 */
export function addressPrefetch(href: string): true | "auto" {
  return CANONICAL.test(href) ? true : "auto";
}
