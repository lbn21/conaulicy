# Data model

`schema/data-model.ts` is the canonical type file. `schema/dataset.schema.json` is the JSON Schema 2020-12 check for the same records. The schema may be public. The processed dataset may not: `etl/out/` is gitignored.

Storage is not decided. Jakub will choose a Vercel store: Blob, Edge Config, or Marketplace Postgres or Redis. This pipeline does not create a database and does not publish to the web app.

An event is one fact at a zone: waste, and later water, power, or weather. `id` is `sha256(zoneId|subtype|start)`. Waste uses one event per fraction per date. `verified` stays false until a person sets `reviewedBy`.

A zone links places to events (`waste:miasto-s1` … `waste:gmina-s5`). A street in no zone has no sector. The UI should say that data is missing. The pipeline does not guess one.

Localities: Lubaczów is `miasto`. A rural parent settlement (SIMC `SYM = SYMPOD`, including Huta Kryształowa, which is an osada) is `wies`. SIMC RM `00` and `03` are `czesc_wsi` and take the parent settlement's zone. SIMC RM `99` (część miasta) is not in the kind union, so those rows are omitted; city streets hang off Lubaczów. Two places are named Dąbrowa: the village in sector 1, and a part of Basznia Górna in sector 4.
