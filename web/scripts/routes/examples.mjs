// Checks the home page's examples (lib/examples.ts): each one opens an
// address page whose timeline has a waste row (in the 7 days or
// „Później”, components/timeline.tsx), and a waste subpage
// with upcoming pickups, and the home page links to each, in order,
// labelled with the place's own name (the page's h1). Fails otherwise.
//
// Runs against `next start` on the current build and database: in CI that is
// the CI fixture, locally .env.local's data (build with `SITE_BASIC_AUTH= npm run
// build`). With CHECK_URL it checks a deployed site instead, e.g.
// CHECK_URL=https://conaulicy.pl (plus SITE_BASIC_AUTH while the gate is on).
import { HOME_EXAMPLES } from "../../lib/examples.ts";

const headers =
  process.env.CHECK_URL && process.env.SITE_BASIC_AUTH
    ? {
        Authorization: `Basic ${Buffer.from(process.env.SITE_BASIC_AUTH).toString("base64")}`,
      }
    : {};
const names = new Map();

export async function check(server, failures) {
  for (const id of HOME_EXAMPLES) {
    const response = await fetch(`${server.origin}/adres/${id}`, { headers });
    const html = await response.text();
    const name = html.match(/<h1 class="govuk-heading-l">([^<]+)<\/h1>/)?.[1];
    names.set(id, name);
    if (response.status !== 200 || !name) {
      failures.push(`/adres/${id}: ${response.status}, not a place page`);
    } else if (
      // A waste row in the timeline's ol, in the HTML (the read's day): by
      // its module's class, never its label's words.
      !/<ol class="app-timeline">(?:(?!<\/ol>)[\s\S])*class="govuk-summary-list__row app-mod app-mod--smieci/.test(
        html,
      )
    ) {
      failures.push(`/adres/${id} (${name}): no pickup in its timeline`);
    } else {
      const waste = await fetch(`${server.origin}/adres/${id}/smieci`, {
        headers,
      });
      if (!(await waste.text()).includes('id="pickups-heading"')) {
        failures.push(`/adres/${id}/smieci (${name}): no upcoming pickups`);
      }
    }
  }

  const home = await (await fetch(`${server.origin}/`, { headers })).text();
  const examples = home.slice(home.indexOf('id="sample-heading"'));
  const links = [
    ...examples.matchAll(
      /<a class="govuk-link" href="\/adres\/([^"]+)">([^<]+)</g,
    ),
  ].map(([, id, label]) => ({ id, label }));
  const shown = links.map((l) => `${l.id} ${l.label}`).join(", ");
  const expected = HOME_EXAMPLES.map((id) => `${id} ${names.get(id)}`).join(
    ", ",
  );
  if (shown !== expected) {
    failures.push(`home examples: ${shown}\n  expected ${expected}`);
  }
  console.log(`Home examples (${server.origin}): ${shown}`);
  return "Home examples: every one has upcoming pickups.";
}
