# ZUK water cuts

Water cuts announced by ZUK Mokrzyca on gminalubaczow.pl, and in the town
by MZGKiM (below), read every 15 minutes into one JSON file per source in
Vercel Blob. No database writes.

## A run (`GET /api/cron/zuk`, Vercel Cron `7,22,37,52 * * * *`)

1. Reads the stored file (`zuk/disruptions.json`, private store `conaulicy-zuk`).
2. Fetches the gmina's posts of the last 14 days (`/wp-json/wp/v2/posts`,
   `lib/sources/gmina-lubaczow/fetch.ts`). No keyword gate: every post goes
   to the model. 14 days: in 18 months of the gmina's posts (54 outage
   posts), an outage was announced 0-4 days ahead and its last day was at
   most 6 days after the post.
3. Has grok-4.7 (xAI, reasoning medium) read only the posts that are new,
   edited (`modified`), read by an older reader (`reader` below
   `ZUK_READER`) or whose last reading failed, and the posts with rejected
   items when the districts changed (`gazetteer`, below): at most 4 per run
   (`lib/zuk-ai.ts`), one call per post. No word filter before the model:
   every post is read once. Every other post keeps its stored result, and
   so does a post read before that is not read this run. The model says
   what the post is (`post_type`):
   - `water_outage`: read for its cuts (steps 4 and 5);
   - `water_quality` (boil-water, contamination, or its lifting,
     `quality_status`): `active` with `reason: "water-quality"`, its places
     through the same gate (`places`, each with its day; none if none
     passes), not shown yet;
   - `other`: `seen` with `reason: "not-water"`, never read again unless
     edited, never shown.
   It also says whether the post moves, cancels or corrects dates the
   source announced earlier, in an earlier post or an earlier version of
   itself (`changes_earlier_dates`, stored as `change`), and whether the
   interruption started before the post (`is_past`, stored as `past`,
   never a reason to drop it).
4. Runs each item through the gate (`lib/zuk-resolve.ts`, below), which
   checks only what is certain, and the day and time checks
   (`lib/zuk-guards.ts`), then expands its place from our tables alone
   (`lib/zuk.ts`). An item that fails is rejected, alone, with a short
   reason (the `rejected` list, below); residents get a link to the post on
   its locality's pages (else the post's localities) wherever none of its
   cuts is shown. A day or time that fails, or no place left, makes the
   whole post a Notice: a link, no date.
5. Drops cuts that are over (`itemCount` keeps how many were read), sorts
   the posts into `active` and `seen` (below) and writes the file on every
   run: `checkedAt` is this run (the pages' „Ostatnio sprawdziliśmy”),
   `generatedAt` the last run that changed what the pages read (every
   `checkedAt` in it aside, and the `rejected` list). About 96 small Blob
   writes a day. A run with rejected items logs them in one line,
   `{zuk: "rejected", source, gazetteer, entries}`.
6. Only a run that changed the content purges the `water` cache tag
   (`revalidateTag("water", { expire: 0 })`, `lib/headers.ts`), after the
   write: the file's cached copy and every response tagged with it, below.
   Never `dataset`: the waste data did not change. An unchanged run, or one
   that wrote nothing, purges nothing.

The gmina's site down: 502, the file and its `checkedAt` stay, and it turns
stale after an hour. xAI down: a new
post is `seen` with `reason: "ai-unavailable"`, retried next run, never
shown; a new post over the run's 4 calls is stored nowhere and read on a
later run. Either way an edited post keeps its old reading until it is read.
A reply off the schema is that post's failure alone, never the model's: it
is tried again after an hour, then after six, and on a third failure given
up (`retries`, and `rejected` as "invalid reply" with the reply's first
2,000 characters) until the post is edited or the reader changes.

A Notice (a post with no cut shown, or its rejected places) goes on the
pages of the localities its items name, passed or rejected, and of the
listed names the model suggests for a place off the list; an area's source
(MZGKiM) on its area. No place name is looked for in the post's text. A
post changing dates (`change`) makes a Notice, instead of dates, of the
earlier posts' cuts still to come at its own places only (its streets; a
whole place, any cut of that locality); a change post that gave no cut at
all (a cancellation) reaches every cut of its localities. `past` (the
model's `is_past`) is stored and changes nothing: cuts settle by their own
days and hours, a failure still going on shown until its end.

## MZGKiM, the town's second source (task 150)

MZGKiM (Miejski Zakład Gospodarki Komunalnej i Mieszkaniowej,
mzgkim.lubaczow.pl) supplies most of the town's water and posts its own
cuts. The same route reads it right after the gmina's posts, into its own
file of the same shape (`mzgkim/disruptions.json`), through the same model,
schema, guards and gate (`lib/sources/mzgkim/`, `lib/water-sources.ts`):

- **Feed, not REST:** its REST API is closed to the public, so the source
  reads its RSS feed (`/category/komunikaty/feed/`, 10 posts a page, more
  pages only while the 14-day window needs them). The feed has no edit time:
  a hash of each item's title and summary (`digest`) tells an edit, and an
  edited post's `modified` is the run that first saw it.
- **The page:** the feed's summary flattens the street list, so a post the
  model reads has its page fetched first (`fullPost`, one request); a page
  that fails is retried next run, as xAI down.
- **Its area:** only the town and its parts are on its list
  (`lib/water-sources.ts` `area`), and its posts never name the town: an
  item of the town itself may leave `locality_verbatim` empty (`implied`);
  a part must be written.
- **Failures stay its own:** the feed down, a page or Blob error: logged
  (`{zuk: "source-down", source: "mzgkim"}`) and listed under `sources` in
  the reply, never the gmina's run or the status. Both runs share one
  model-call budget from the route's start.

Model calls: every new or edited post, one each: about 20 a year (it
posts 10 in a few months), so 0 on almost every day. The feed costs 96
small requests a day.

The pages (`lib/water-module.ts`): one logic and one set of texts for every
address; only the list of sources differs (the gmina's everywhere, MZGKiM's
in the town and its parts). A cut's „Źródło” is its own post only. A source
stale or without a file is named in the texts when the address has another
that is not.

## The town's districts: the gazetteer (task 151)

Residents and MZGKiM name estates TERYT lacks ("osiedle Mazury", "os.
Jagiellonów"), or has only as a town part with no street (Mazury 0972453 has
no address, its point 0.5–0.8 km south of the estate). The gazetteer gives
each a name, the forms it is written in, and its streets
(`lib/districts.ts`; the data, Jakub's approved list of 26 Oct 2026 from the
research (Jakub's file, not in git), in `lib/districts-seed.ts`: high and
medium confidence in, low out; Załuże and Bałaje are villages, never a town
district). It lives in the database (`district_aliases`,
`district_alias_streets`, docs/database.md), which the cron reads
(`lib/districts-db.ts`) for both prompts and the gate:

- **The prompt:** lists the districts once, in the context, with their
  forms and streets. The model names a district by its listed name; it
  maps the post's words (a form, "osiedle X", "X wraz z osiedlem", a
  misspelling) to it, never the code.
- **The gate:** a `street` that is a listed district of the item's town is
  that district: each of its streets, whole (a stretch where the gazetteer
  gives one, "bloki 24–34A": in part, houses unknown; the item's note
  limits them all), with the post's words as `where`. A street an item
  names itself wins over the district's: never twice, never wider. A
  district with no street known is rejected ("district has no streets")
  and linked.
- **Doubts:** the model's `doubt` is the listed district a bare street
  name may mean instead (a bare "Mazury": the street, or the estate). The
  gate checks only that it is a listed district with streets; the file
  keeps the post's words and that district's streets (`doubts`). Only the
  pages of those streets, and only where that post shows no cut of its
  own, say it in one line linking the post: „MZGKiM pisze tylko „Mazury”,
  więc nie wiemy na pewno, czy chodzi o ulicę, czy o całe osiedle –
  zajrzyj do komunikatu” (`water` in `lib/water-module.ts`; no names in
  code).

A district street the TERYT snapshot lacks is skipped by the gate and
logged by the cron (`{zuk: "district-street-unknown", district, street}`,
ids only); the seed refuses such ids in the first place.

Adding a district is a new entry in `lib/districts-seed.ts`, then `npm run
db:districts` (dry run, then `-- --apply`; production only with Jakub's
approval for that run). The tests read the seed; `checkDistricts` fails on
any street id not in the TERYT snapshot.

To try a post on the real model on your own computer (no write anywhere):

```sh
cd web
npm run water:dry-run -- --source mzgkim --file post.txt --published 2026-10-02T12:11:39
npm run water:dry-run -- --case 39885   # a prompt regression case, its expected reading too
# --ai reading.json: gate a saved model reading again, no call
# --districts db: the gazetteer from DATABASE_URL instead of the seed
```

It prints the model's JSON and the gate's result (`scripts/lib/water-dry-run.ts`
`waterDryRun`, the same prompt, schema and gate as the cron).

## The file (version 5, `lib/zuk-data.ts`)

```json
{
  "version": 5,
  "generatedAt": "2026-10-25T08:00:00.000Z",
  "checkedAt": "2026-10-25T08:00:00.000Z",
  "gazetteer": "3f2a9c01b7d4",
  "active": [{ "id": 39885, "modified": "…", "reader": 7, "url": "…",
               "title": "…", "status": "parsed", "localityIds": ["…"],
               "itemCount": 76, "items": ["…"], "sourceId": "gmina-lubaczow",
               "unmatched": [{ "words": "ul. Próbna", "localityId": "…" }] }],
  "seen": [{ "id": 39868, "modified": "…", "reason": "not-water", "reader": 7 }],
  "rejected": [{ "postId": 39885, "url": "…", "sourceId": "gmina-lubaczow",
                 "publishedAt": "…", "readAt": "…", "item": {"…": "…"},
                 "reason": "street not listed", "suggested_places": ["…"] }]
}
```

- `active`: what the pages read: parsed posts with cuts still to come
  (only those cuts), Notices (water posts that could not be read) within
  their 14 days, water-quality posts (not shown yet), and a date-change
  post while it doubts an active cut. `unmatched`: its rejected items, as
  the pages link them.
- `seen`: one record per other decided post, for the cron only: `not-water`,
  `past` (its cuts are over), `expired` (a Notice past its 14 days),
  `ai-unavailable`. No title, url, places or cuts.
- `rejected`: for review only, never read by the pages: every item of a
  post in the window that failed, the model's JSON as returned, a reason
  (`locality not listed`, `street not listed`, `district has no streets`,
  `not in post`, `date`, `time`, or `invalid reply`) and the model's
  `suggested_places` (listed
  names only). Rebuilt each run: a post read again replaces its entries,
  a post out of the window takes them along. Never applied by itself: a
  fix is a data-table change (the gazetteer) or a prompt rewrite.
- `gazetteer`: a short hash of the district rows the posts were read with.
  When it differs, the posts with rejected places are read again, and the
  new hash is kept only once every one of them has been (a run over its
  calls, or with xAI down, keeps the old one); the districts are loaded
  whenever a post is to be read or `rejected` is not empty.
- `retries`: a post whose reply was not the schema, by reader and version:
  its tries and when it may be tried again (null: given up).
- A post leaves `active` and `seen` when it leaves the 14-day window. The
  model's tokens and cost are in the log only.
- The file version is the shape; `reader` (`ZUK_READER`, now 7: the shared
  prompt and the gate of certain checks, task 182) is what read the post.
  Raise `ZUK_READER` and every post is read again, 4 a run. A file of an
  older version is no file: the pages show the source link and the cron
  reads the window afresh, 4 a run, and replaces it (never delete the
  Blob by hand).

## The prompt (task 182)

One prompt for every source (`lib/water-prompt.ts`): a short header of the
source's own, saying how it writes (`lib/sources/<id>/index.ts`; from the
style analysis of both sources' posts), the shared rules, then the context.
The rules are general principles only: read the post by the header's
conventions, copy the post's words verbatim, name each place by the listed
name its words clearly refer to (a listed part as that part), never invent
places, days or times, put every limitation in the note without dropping
the place, return a place no listed name fits with `suggested_places`. No rule is written for one post: a post the model
reads wrongly becomes a regression case (`lib/water-cases.ts`, run by
`--case` on the real model) and the fix is a rewrite of the prompt or a
data-table change, then a dry run. Every example name is invented. The
context is the source's area from the TERYT snapshot (towns, villages,
parts as "Name (Village)", each locality's streets by TERYT name) and the
districts, sorted, so it is byte-stable for the same places. An item gives
the locality and street (or district) as listed, the post's own words for
them, any limitation as one literal `note`, `end_estimated`, `whole_town`
with its words, a `doubt` and `suggested_places`. The model never returns
ids; our code maps listed names to them.

Each cut carries our names for its label (`label`: locality, its village
for a village part, street) and its houses (`scope`); the source's own
wording stays in `where` (its street, else its locality, as written) and
`note`. Pages read the file through `lib/zuk-store.ts` `getZukData()`; data last
checked more than 60 minutes ago is `stale`, so a page shows the source link
instead.

**Caching.** `getZukData()` keeps the file in Next's data cache for 10
minutes, tagged `water`; each refill reads the Blob's origin, not its CDN
copy. The tag is also on every page rendered from it (their ISR entries:
`/adres/[id]` and `/adres/[id]/woda`, with or without a house number) and,
as `Vercel-Cache-Tag: dataset,water`, on the calendar file
`/adres/[id]/woda.ics` (CDN: an hour, a day stale-while-revalidate). So a
changed file reaches them on the next request after the run; an unchanged
run purges nothing, and „Ostatnio sprawdziliśmy” there lags by up to those
cache ages, as before.

With a house number (`?nr=`), a cut by house ranges or numbers that clearly
leaves it out is not shown, on the page or in its calendar file, and the page
says one was left out (`lib/water-module.ts` `outsideRange`); anything we
cannot compare is always shown.

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

## Fail closed (the gate: certain checks only)

Generic, from the snapshot and the districts only: no place-specific code,
list or alias, and no word rule on the post's text beyond these literal
checks:

- the day: written in the post (D.M, "D <month>", inside "a-b.M", "a do
  b.M", "a.M - b.M", or "(od) D.M.YYYY do/- D.M.YYYY", ends included), a
  year written with it the item's, a bracketed weekday that matches; from
  the day before the post to 31 days after its last edit (`date`);
- times: valid HH:MM, written on the item's own lines (those its quoted
  pieces are on) or on a line that quotes no item (the opening line with
  the hours for all), never only on another item's line; an end before the
  start is the next day; the same start and end none (`time`);
- `locality`: a listed name of the source's list, exactly (`locality not
  listed`); `locality_verbatim` in the post, empty only for the town of
  a source that never names it (`not in post`);
- `street`: a listed street of that locality or a listed district of it,
  exactly (`street not listed`); its words in the post (`not in post`);
  words of a street with no listed `street` are a street not listed;
- the town without a street only with `whole_town` and its words in the
  post;
- the note: in the post, one literal piece.

"In the post": a substring of the title and text, case, dashes and runs of
spaces aside. A village-wide cut covers the village and every street of
its own, from our data, not its village parts. House numbers for a place
with streets are the place only, never copied onto its streets. The houses
come from the note: ranges or numbers if that is all it says, else
"unknown" (part of the place), and so for a range it cannot read.

## Our places: the TERYT snapshot

`web/lib/zuk-places.generated.ts` holds every locality, village part and
street TERYT has for our gminy (69 and 276), each street with its TERYT
CECHA and NAZWA_1. It is what the prompt and the gate read, in production
(`app/api/cron/zuk/route.ts`, not the database, which has no CECHA forms)
and in CI, with no database or network (`lib/zuk-resolve.test.ts`,
`lib/water-cases.test.ts`). It is built only from the public
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
