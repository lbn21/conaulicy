# ZUK water cuts

Water cuts announced by ZUK Mokrzyca on gminalubaczow.pl, read every 15
minutes into one JSON file in Vercel Blob. No database writes, no UI yet.

## A run (`GET /api/cron/zuk`, Vercel Cron `*/15 * * * *`)

1. Reads the stored file (`zuk/disruptions.json`, private store `conaulicy-zuk`).
2. Fetches the gmina's posts of the last 30 days (`/wp-json/wp/v2/posts`,
   `lib/sources/gmina-lubaczow/fetch.ts`). No keyword gate: every post goes
   to the model.
3. Has grok-4.7 (xAI, reasoning low) read only the posts that are new, edited
   (`modified`) or whose last reading failed or waited: at most 4 per run
   (`lib/zuk-ai.ts`), one call per post. Every other post keeps its stored
   result. A post whose title's days are all before today (Warsaw) is not
   read: a Notice with `reason: "past"`, never shown. The model says what
   the post is (`post_type`):
   - `water_outage`: read for its cuts (steps 4 and 5);
   - `water_quality` (boil-water, contamination, or its lifting,
     `quality_status`): a Notice with `reason: "water-quality"`, its places
     through the same gate (`places`, each with its day; none if none
     passes), not shown yet;
   - `other`: a Notice with `reason: "not-water"`, never read again unless
     edited, never shown.
   The old keyword filter (`matchesOutageKeywords`) only cross-checks: where
   it and the model disagree, the log has `{zuk: "classify-disagree"}`.
4. Runs each item through the place gate (v3.1, `lib/zuk-resolve.ts`, below)
   and then the repo's own, stricter checks (`lib/zuk-guards.ts`: the day
   near the post's dates, the times in the text, nothing left out when
   there is no note, the houses from the note). A place that fails is
   dropped, alone, and shown nowhere; a day or time that fails, or no place
   left, makes the whole post a Notice: a link, no date.
5. Drops cuts that are over (`itemCount` keeps how many were read) and
   writes the file if its content changed, or to refresh `checkedAt` every
   30 minutes.

The gmina's site down: 502, the file stays and turns stale. xAI down: new
and edited posts become Notices (`reason: "ai-unavailable"`), retried next
run; so do posts over the run's 4 calls (`reason: "ai-deferred"`). A file of
version 1 or 2 (read with the v1 prompt and gate) is still read by the
pages; the cron reads every post again and writes version 3.

## The prompt (v3.1)

One module per source (`lib/sources/<id>/prompt.ts`; a new source is a
prompt plus a fetch adapter, `lib/sources/source.ts`); the schema
(`schema-v31.json` of the X8 handoff), the reply check, the guards and the
place gate are shared. Each stored post keeps its `sourceId`. The gmina
Lubaczów's prompt is the rules (what a post is, `post_type`, Jakub's X8
text; the item and place-name rules, every example name invented) and
then the context, built from the TERYT snapshot (`systemPrompt`): our town,
villages, village parts (with their village) and every street of each
locality, by its TERYT name, in a fixed order, so the rules are a fixed
prefix and the context follows the data. For the full snapshot it is
14,125 bytes, SHA-256 `b8675dd3…faba6`, byte for byte the prompt measured
offline (task 114b: 263 real posts, 263/263 classified, 0 wrong places;
the recorded replies are `lib/zuk-golden.ts`). An item gives the locality
and street as on our list, the post's own words for them
(`locality_verbatim`, `street_verbatim`), and any limitation (house
ranges, "w części", an unlisted part's name, "(przysiółek …)") as one
literal `note`. The model never returns ids; our code decides.

Each cut carries our names for its label (`label`: locality, its village
for a village part, street) and its houses (`scope`); the source's own
wording stays in `where` (its street, else its locality, as written) and
`note`. Pages read the file through `lib/zuk-store.ts` `getZukData()`; data last
checked more than 60 minutes ago is `stale`, so a page shows the source link
instead.

## Environment (Vercel, Production and Preview)

| Variable | Used for |
|---|---|
| `CRON_SECRET` | Vercel Cron's `Authorization: Bearer …`; the route refuses anything else |
| `XAI_API_KEY` | the model; without it every new post is a Notice |
| `BLOB_READ_WRITE_TOKEN` | the private Blob store, read and write |

## By hand

```sh
curl -H "Authorization: Bearer $CRON_SECRET" https://conaulicy.pl/api/cron/zuk
```

The reply is the run's summary: posts, model calls, cost, whether it wrote.
Each model call logs its post, tokens, latency and cost (USD, $2/1M in,
$6/1M out and reasoning) in the function log.

## Fail closed (the gate, gate-spec v3.1, then the repo's checks)

Generic, from the snapshot only: no place-specific code, list or alias.

- a day not written in the post (D.M, "D <month>", inside "a-b.M", "a do
  b.M", "a.M - b.M"; not "od D.M.Y do D.M.Y"), a bracketed weekday that
  does not match, a day far from the post's dates, a time not in the text;
- a locality not ours, or a name two places share without the village;
  `locality_verbatim` not in the text, not exactly the locality's name
  (case and diacritics aside: an inflected "w Lubaczowie" alone is
  dropped), or only inside a longer name of ours ("Basznia" in "Basznia
  Dolna"); a whole place named only as a street ("ul. Żuki"), or
  "przysiółek X" without X's village;
- a street not exactly one of that locality's, by its name or CECHA form
  ("os. Wolności"), else a unique end ("Sobieskiego"); `street_verbatim` not
  in the text or not pointing at this street alone ("Mickiewicza" with no
  type word: ul. or os.?; "ul. Kurierów Armii Krajowej" for "Armii
  Krajowej"); the locality that decides for it (a bracket right after it,
  "ul. Przemysłowa (Lubaczów)", else the nearest before, else the nearest
  after in its sentence) not this one, or only inflected;
- all of Lubaczów; house numbers for a village with streets;
- a note not one literal piece of the post, or naming another place of
  ours; with no note, the place in the text with something left out (house
  numbers, "w części", a bracket) that no other item's note has.

A mention of our place is a capitalised run of words matching one of our
names by stem (a word less up to 3 final letters, at least 3 left), an
all-caps word only exactly ("ZUK" is not Żuki), and a look-alike that is a
street ("Piaskowa") none; only an exact mention approves. A name a village
and a village part share is the village, unless written with its village
("Dąbrowa (Basznia Górna)"). A village-wide cut covers the village and
every street of its own, from our data, not its village parts. The houses
come from the note: ranges or numbers if that is all it says, else
"unknown" (part of the place).

## Our places: the TERYT snapshot

`web/lib/zuk-places.generated.ts` holds every locality, village part and
street TERYT has for our gminy (69 and 276), each street with its TERYT
CECHA and NAZWA_1. It is what the prompt and the gate read, in production
(`app/api/cron/zuk/route.ts`, not the database, which has no CECHA forms)
and in CI, with no database or network: every one of our names resolves to
one place, the one named, or is dropped; no two of our names match each
other under the stem rule; the golden set gives its hand-checked result
item by item (`lib/zuk-resolve.test.ts`). It is built only from the public
GUS TERYT files archived in `etl/sources.yaml`. Refresh it whenever those
change (a reviewed TERYT difference):

```sh
cd web && npm run sources:pull && npm run zuk:places
```

`zuk:places` takes the newest archived SIMC and ULIC files from
`.cache/sources/` and checks their SHA-256 against `etl/sources.yaml`
(`-- --teryt <dir>` reads another directory). It cannot drift silently:
every apply run of the import workflow, the one job with read access to
the archive (PR CI has none), pulls the TERYT files
(`npm run sources:pull -- --origin teryt`) and runs `npm run zuk:places --
--check`, which fails the run, and opens its workflow issue, if the
committed file differs.
