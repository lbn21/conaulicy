# ZUK water cuts

Water cuts announced by ZUK Mokrzyca on gminalubaczow.pl, read every 15
minutes into one JSON file in Vercel Blob. No database writes, no UI yet.

## A run (`GET /api/cron/zuk`, Vercel Cron `*/15 * * * *`)

1. Reads the stored file (`zuk/disruptions.json`, private store `conaulicy-zuk`).
2. Fetches the gmina's posts of the last 30 days (`/wp-json/wp/v2/posts`) and
   keeps ZUK's water cut notices (`lib/zuk.ts` `isZukPost`).
3. Has grok-4.7 (xAI, reasoning low) read only the posts that are new, edited
   (`modified`) or whose last reading failed or waited: at most 4 per run
   (`lib/zuk-ai.ts`). Every other post keeps its stored result. A post whose
   title's days are all before today (Warsaw) is not read: a Notice with
   `reason: "past"`, never shown.
4. Checks each item against the post's own text (`lib/zuk-guards.ts`) and
   maps it to our places (`lib/zuk-resolve.ts`). A place that fails is
   dropped, alone, and shown nowhere; a day or time that fails, or no place
   left, makes the whole post a Notice: a link, no date.
5. Drops cuts that are over (`itemCount` keeps how many were read) and
   writes the file if its content changed, or to refresh `checkedAt` every
   30 minutes.

The gmina's site down: 502, the file stays and turns stale. xAI down: new
and edited posts become Notices (`reason: "ai-unavailable"`), retried next
run; so do posts over the run's 4 calls (`reason: "ai-deferred"`). A file of
version 1 is still read by the pages; the cron reads every post again and
writes version 2.

## The prompt

The rules, then the context: our town, villages and village parts (with
their village), built from the same places the resolver uses
(`systemPrompt`), in a fixed order, so it is a cacheable prefix and follows
the data. No streets: they made the readings worse. The model writes the
locality as on that list and never returns ids; our code decides. On the 24
hand-checked posts it scored 330/330 place-days, 0 wrong (A/B test, 25 Oct
2026; `lib/zuk-fixture-b.ts`).

Each cut carries our names for its label (`label`: locality, its village
for a village part, street) and its houses (`scope`); the source's own
wording stays in `where`. Pages read the file through `lib/zuk-store.ts` `getZukData()`; data last
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

## Fail closed

- a day and month not in the text, or not inside an "od D.M do D.M" range; a
  weekday that does not match; a time not in the text;
- a place phrase not in the text, or one that leaves out what the text adds
  to it (house numbers, a street, "w części", a bracket), or a street dropped
  ("Młodów, ul. Pilipy" read as all of Młodów);
- a place we cannot pin to exactly one of ours (`lib/zuk-resolve.ts`, no
  alias list): a name not ours; a name not in the text and the item's
  phrase on its own, or only inside a longer name of ours ("Basznia" in
  "Basznia Dolna") or after "ul." ("Lubaczów ul. Żuki" is not the village
  part Żuki); a name two village parts share, without the village in the
  phrase (Mielniki); "przysiółek X" without X's village; a street not among
  that locality's own, by its whole name or an end of it no other of its
  streets shares ("Sobieskiego"); house numbers for a village with streets;
  all of Lubaczów.

A name a village and a village part share is the village ("Dąbrowa"),
unless the phrase names the part's village. A name not on our list attached
to a village ("Załuże–Podłęże") is that village, only partly: the model
gives the village as the locality and the name as the note. "(przysiółek X)"
is the village part X. A village-wide cut covers the village and every
street of its own, from our data, not its village parts.
