# ZUK water cuts

Water cuts announced by ZUK Mokrzyca on gminalubaczow.pl, read every 15
minutes into one JSON file in Vercel Blob. No database writes, no UI yet.

## A run (`GET /api/cron/zuk`, Vercel Cron `*/15 * * * *`)

1. Reads the stored file (`zuk/disruptions.json`, private store `conaulicy-zuk`).
2. Fetches the gmina's posts of the last 30 days (`/wp-json/wp/v2/posts`) and
   keeps ZUK's water cut notices (`lib/zuk.ts` `isZukPost`).
3. Has grok-4.7 (xAI, reasoning low) read only the posts that are new, edited
   (`modified`) or whose last reading failed: at most 4 per run
   (`lib/zuk-ai.ts`). Every other post keeps its stored result.
4. Checks each item against the post's own text (`lib/zuk-guards.ts`) and
   maps it to our places (`lib/zuk-resolve.ts`). Any doubt makes the whole
   post a Notice: a link, no date.
5. Drops cuts that are over and writes the file if its content changed, or
   to refresh `checkedAt` every 30 minutes.

The gmina's site down: 502, the file stays and turns stale. xAI down: new
and edited posts become Notices (`reason: "ai-unavailable"`), retried next
run. Pages read the file through `lib/zuk-store.ts` `getZukData()`; data last
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
- a locality with no match or several ("Dąbrowa"), a street not among that
  locality's own, house numbers for a village with streets, all of Lubaczów.

Local names TERYT does not have: Podłęże (part of Załuże), "(przysiółek X)"
(the village part X). A village-wide cut covers the village and every street
of its own, not its village parts.
