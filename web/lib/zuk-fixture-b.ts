// The prompt A/B test of 25 Oct 2026 (task 112): grok-4.7 with the context
// prompt (lib/zuk-ai.ts systemPrompt, design B; reasoning low, temp. 0) on
// the 24 real posts of lib/zuk-fixture.ts, and what those posts say,
// checked by hand. A fixture, so code (scripts/check-tracked-data.mjs).

import type { AiResult } from "./zuk-ai.ts";

/**
 * grok-4.7's replies with the context prompt: the message content as returned,
 * the post's id put first, one post per line (a rerun gave the same).
 */
const REPLIES_B = `
{"id": 14117, "is_outage_notice": true, "is_past": false, "items": [{"date": "2021-12-15", "start": null, "end": "13:00", "locality": "Młodów", "street": null, "place_verbatim": "Młodów", "note": null, "kind": "emergency"}, {"date": "2021-12-15", "start": null, "end": "13:00", "locality": "Karolówka", "street": null, "place_verbatim": "Karolówka", "note": null, "kind": "emergency"}]}
{"id": 23860, "is_outage_notice": true, "is_past": false, "items": [{"date": "2023-11-02", "start": "09:00", "end": "15:00", "locality": "Tymce", "street": null, "place_verbatim": "Tymce", "note": null, "kind": "planned"}, {"date": "2023-11-02", "start": "09:00", "end": "15:00", "locality": "Załuże", "street": null, "place_verbatim": "Załuże", "note": null, "kind": "planned"}, {"date": "2023-11-03", "start": "09:00", "end": "15:00", "locality": "Tymce", "street": null, "place_verbatim": "Tymce", "note": null, "kind": "planned"}, {"date": "2023-11-03", "start": "09:00", "end": "15:00", "locality": "Załuże", "street": null, "place_verbatim": "Załuże", "note": null, "kind": "planned"}, {"date": "2023-11-06", "start": "09:00", "end": "15:00", "locality": "Tymce", "street": null, "place_verbatim": "Tymce", "note": null, "kind": "planned"}, {"date": "2023-11-06", "start": "09:00", "end": "15:00", "locality": "Załuże", "street": null, "place_verbatim": "Załuże", "note": null, "kind": "planned"}, {"date": "2023-11-07", "start": "09:00", "end": "15:00", "locality": "Tymce", "street": null, "place_verbatim": "Tymce", "note": null, "kind": "planned"}, {"date": "2023-11-07", "start": "09:00", "end": "15:00", "locality": "Załuże", "street": null, "place_verbatim": "Załuże", "note": null, "kind": "planned"}, {"date": "2023-11-08", "start": "09:00", "end": "15:00", "locality": "Tymce", "street": null, "place_verbatim": "Tymce", "note": null, "kind": "planned"}, {"date": "2023-11-08", "start": "09:00", "end": "15:00", "locality": "Załuże", "street": null, "place_verbatim": "Załuże", "note": null, "kind": "planned"}, {"date": "2023-11-09", "start": "09:00", "end": "15:00", "locality": "Tymce", "street": null, "place_verbatim": "Tymce", "note": null, "kind": "planned"}, {"date": "2023-11-09", "start": "09:00", "end": "15:00", "locality": "Załuże", "street": null, "place_verbatim": "Załuże", "note": null, "kind": "planned"}, {"date": "2023-11-10", "start": "09:00", "end": "15:00", "locality": "Tymce", "street": null, "place_verbatim": "Tymce", "note": null, "kind": "planned"}, {"date": "2023-11-10", "start": "09:00", "end": "15:00", "locality": "Załuże", "street": null, "place_verbatim": "Załuże", "note": null, "kind": "planned"}]}
{"id": 24161, "is_outage_notice": true, "is_past": false, "items": [{"date": "2023-11-23", "start": "09:00", "end": "15:00", "locality": "Załuże", "street": null, "place_verbatim": "Załuże", "note": null, "kind": "planned"}, {"date": "2023-11-23", "start": "09:00", "end": "15:00", "locality": "Tymce", "street": null, "place_verbatim": "Tymce", "note": null, "kind": "planned"}, {"date": "2023-11-24", "start": "09:00", "end": "15:00", "locality": "Załuże", "street": null, "place_verbatim": "Załuże", "note": null, "kind": "planned"}, {"date": "2023-11-24", "start": "09:00", "end": "15:00", "locality": "Tymce", "street": null, "place_verbatim": "Tymce", "note": null, "kind": "planned"}, {"date": "2023-11-27", "start": "09:00", "end": "15:00", "locality": "Załuże", "street": null, "place_verbatim": "Załuże", "note": null, "kind": "planned"}, {"date": "2023-11-27", "start": "09:00", "end": "15:00", "locality": "Tymce", "street": null, "place_verbatim": "Tymce", "note": null, "kind": "planned"}, {"date": "2023-11-28", "start": "09:00", "end": "15:00", "locality": "Załuże", "street": null, "place_verbatim": "Załuże", "note": null, "kind": "planned"}, {"date": "2023-11-28", "start": "09:00", "end": "15:00", "locality": "Tymce", "street": null, "place_verbatim": "Tymce", "note": null, "kind": "planned"}]}
{"id": 26028, "is_outage_notice": true, "is_past": false, "items": [{"date": "2024-04-09", "start": "10:00", "end": "15:00", "locality": "Bałaje", "street": null, "place_verbatim": "w części miejscowości Bałaje", "note": "w części miejscowości", "kind": "planned"}, {"date": "2024-04-09", "start": "10:00", "end": "15:00", "locality": "Lubaczów", "street": "Przemysłowa", "place_verbatim": "Lubaczów – ul. Przemysłowa (gospodarstwa zasilane z SUW Mokrzyca)", "note": "gospodarstwa zasilane z SUW Mokrzyca", "kind": "planned"}, {"date": "2024-04-10", "start": "09:00", "end": "15:00", "locality": "Antoniki", "street": null, "place_verbatim": "Antoniki", "note": null, "kind": "planned"}, {"date": "2024-04-10", "start": "09:00", "end": "15:00", "locality": "Bałaje", "street": null, "place_verbatim": "Bałaje", "note": null, "kind": "planned"}, {"date": "2024-04-10", "start": "09:00", "end": "15:00", "locality": "Młodów", "street": "Pilipy", "place_verbatim": "Młodów ul. Pilipy", "note": null, "kind": "planned"}, {"date": "2024-04-10", "start": "09:00", "end": "15:00", "locality": "Załuże", "street": null, "place_verbatim": "Załuże (Podłęże)", "note": "Podłęże", "kind": "planned"}, {"date": "2024-04-12", "start": "09:00", "end": "15:00", "locality": "Antoniki", "street": null, "place_verbatim": "Antoniki", "note": null, "kind": "planned"}, {"date": "2024-04-12", "start": "09:00", "end": "15:00", "locality": "Bałaje", "street": null, "place_verbatim": "Bałaje", "note": null, "kind": "planned"}, {"date": "2024-04-12", "start": "09:00", "end": "15:00", "locality": "Młodów", "street": "Pilipy", "place_verbatim": "Młodów ul. Pilipy", "note": null, "kind": "planned"}, {"date": "2024-04-12", "start": "09:00", "end": "15:00", "locality": "Załuże", "street": null, "place_verbatim": "Załuże (Podłęże)", "note": "Podłęże", "kind": "planned"}, {"date": "2024-04-11", "start": "09:00", "end": "15:00", "locality": "Piastowo", "street": null, "place_verbatim": "Piastowo", "note": null, "kind": "planned"}]}
{"id": 34394, "is_outage_notice": true, "is_past": true, "items": [{"date": "2025-10-09", "start": null, "end": "17:00", "locality": "Dąbrowa", "street": null, "place_verbatim": "Dąbrowa", "note": null, "kind": "emergency"}, {"date": "2025-10-09", "start": null, "end": "17:00", "locality": "Krowica Lasowa", "street": null, "place_verbatim": "Krowica Lasowa", "note": null, "kind": "emergency"}]}
{"id": 35661, "is_outage_notice": true, "is_past": true, "items": [{"date": "2025-12-16", "start": null, "end": "19:00", "locality": "Lisie Jamy", "street": null, "place_verbatim": "Lisie Jamy", "note": null, "kind": "emergency"}, {"date": "2025-12-16", "start": null, "end": "19:00", "locality": "Wólka Krowicka", "street": null, "place_verbatim": "Wólka Krowicka", "note": null, "kind": "emergency"}, {"date": "2025-12-16", "start": null, "end": "19:00", "locality": "Krowica Sama", "street": null, "place_verbatim": "Krowica Sama", "note": null, "kind": "emergency"}, {"date": "2025-12-16", "start": null, "end": "19:00", "locality": "Krowica Hołodowska", "street": null, "place_verbatim": "Krowica Hołodowska", "note": null, "kind": "emergency"}, {"date": "2025-12-16", "start": null, "end": "19:00", "locality": "Budomierz", "street": null, "place_verbatim": "Budomierz", "note": null, "kind": "emergency"}]}
{"id": 35690, "is_outage_notice": true, "is_past": false, "items": [{"date": "2025-12-21", "start": "22:00", "end": "05:00", "locality": "Lisie Jamy", "street": null, "place_verbatim": "Lisie Jamy", "note": null, "kind": "planned"}, {"date": "2025-12-21", "start": "22:00", "end": "05:00", "locality": "Wólka Krowicka", "street": null, "place_verbatim": "Wólka Krowicka", "note": null, "kind": "planned"}, {"date": "2025-12-21", "start": "22:00", "end": "05:00", "locality": "Krowica Sama", "street": null, "place_verbatim": "Krowica Sama", "note": null, "kind": "planned"}, {"date": "2025-12-21", "start": "22:00", "end": "05:00", "locality": "Krowica Hołodowska", "street": null, "place_verbatim": "Krowica Hołodowska", "note": null, "kind": "planned"}, {"date": "2025-12-21", "start": "22:00", "end": "05:00", "locality": "Budomierz", "street": null, "place_verbatim": "Budomierz", "note": null, "kind": "planned"}]}
{"id": 38890, "is_outage_notice": true, "is_past": false, "items": [{"date": "2026-09-02", "start": "08:00", "end": "16:00", "locality": "Karolówka", "street": "Sobieskiego", "place_verbatim": "Karolówka, ul. Sobieskiego numery: od 1 do 15 i od 16 do 54", "note": null, "kind": "planned"}]}
{"id": 38969, "is_outage_notice": true, "is_past": false, "items": [{"date": "2026-09-07", "start": "08:00", "end": "16:00", "locality": "Młodów", "street": "Floriana", "place_verbatim": "Młodów, ul. Floriana", "note": null, "kind": "planned"}, {"date": "2026-09-08", "start": "08:00", "end": "16:00", "locality": "Młodów", "street": "Floriana", "place_verbatim": "Młodów, ul. Floriana", "note": null, "kind": "planned"}]}
{"id": 39160, "is_outage_notice": true, "is_past": false, "items": [{"date": "2026-09-14", "start": "08:00", "end": "16:00", "locality": "Lisie Jamy", "street": "Długa", "place_verbatim": "Lisie Jamy ul. Długa od nr 40 do nr 145", "note": null, "kind": "planned"}]}
{"id": 39304, "is_outage_notice": true, "is_past": false, "items": [{"date": "2026-09-15", "start": "08:00", "end": "16:00", "locality": "Młodów", "street": "Leśna", "place_verbatim": "Młodów, ul. Leśna", "note": null, "kind": "planned"}, {"date": "2026-09-15", "start": "08:00", "end": "16:00", "locality": "Młodów", "street": "Warszawska", "place_verbatim": "Młodów, ul. Leśna, Warszawska", "note": null, "kind": "planned"}, {"date": "2026-09-15", "start": "08:00", "end": "16:00", "locality": "Młodów", "street": "Rzeczna", "place_verbatim": "Młodów, ul. Leśna, Warszawska, Rzeczna", "note": null, "kind": "planned"}, {"date": "2026-09-15", "start": "08:00", "end": "16:00", "locality": "Młodów", "street": "Wodna", "place_verbatim": "Młodów, ul. Leśna, Warszawska, Rzeczna, Wodna", "note": null, "kind": "planned"}, {"date": "2026-09-15", "start": "08:00", "end": "16:00", "locality": "Młodów", "street": "Błonie", "place_verbatim": "Młodów, ul. Leśna, Warszawska, Rzeczna, Wodna, Błonie", "note": null, "kind": "planned"}, {"date": "2026-09-15", "start": "08:00", "end": "16:00", "locality": "Młodów", "street": "Sąsiedzka", "place_verbatim": "Młodów, ul. Leśna, Warszawska, Rzeczna, Wodna, Błonie, Sąsiedzka", "note": null, "kind": "planned"}, {"date": "2026-09-15", "start": "08:00", "end": "16:00", "locality": "Młodów", "street": "Słoneczna", "place_verbatim": "Młodów, ul. Leśna, Warszawska, Rzeczna, Wodna, Błonie, Sąsiedzka, Słoneczna", "note": null, "kind": "planned"}, {"date": "2026-09-15", "start": "08:00", "end": "16:00", "locality": "Młodów", "street": "Piaskowa", "place_verbatim": "Młodów, ul. Leśna, Warszawska, Rzeczna, Wodna, Błonie, Sąsiedzka, Słoneczna, Piaskowa", "note": null, "kind": "planned"}, {"date": "2026-09-15", "start": "08:00", "end": "16:00", "locality": "Młodów", "street": "Krótka", "place_verbatim": "Młodów, ul. Leśna, Warszawska, Rzeczna, Wodna, Błonie, Sąsiedzka, Słoneczna, Piaskowa, Krótka", "note": null, "kind": "planned"}, {"date": "2026-09-15", "start": "08:00", "end": "16:00", "locality": "Karolówka", "street": "Sobieskiego", "place_verbatim": "Karolówka, ul. Sobieskiego od nr 27 do nr 47", "note": null, "kind": "planned"}]}
{"id": 39460, "is_outage_notice": true, "is_past": false, "items": [{"date": "2026-09-24", "start": "08:00", "end": "16:00", "locality": "Lisie Jamy", "street": "Lwowska", "place_verbatim": "Lisie Jamy: ul. Lwowska od nr 26 do nr 42", "note": null, "kind": "planned"}, {"date": "2026-09-24", "start": "08:00", "end": "16:00", "locality": "Lisie Jamy", "street": "Długa", "place_verbatim": "Lisie Jamy: ul. Lwowska od nr 26 do nr 42, Długa", "note": null, "kind": "planned"}, {"date": "2026-09-24", "start": "08:00", "end": "16:00", "locality": "Lisie Jamy", "street": "Polna", "place_verbatim": "Lisie Jamy: ul. Lwowska od nr 26 do nr 42, Długa, Polna", "note": null, "kind": "planned"}, {"date": "2026-09-24", "start": "08:00", "end": "16:00", "locality": "Lisie Jamy", "street": "Leśna", "place_verbatim": "Lisie Jamy: ul. Lwowska od nr 26 do nr 42, Długa, Polna, Leśna", "note": null, "kind": "planned"}, {"date": "2026-09-24", "start": "08:00", "end": "16:00", "locality": "Lisie Jamy", "street": "Wąska", "place_verbatim": "Lisie Jamy: ul. Lwowska od nr 26 do nr 42, Długa, Polna, Leśna, Wąska", "note": null, "kind": "planned"}, {"date": "2026-09-24", "start": "08:00", "end": "16:00", "locality": "Lisie Jamy", "street": "Zielona", "place_verbatim": "Lisie Jamy: ul. Lwowska od nr 26 do nr 42, Długa, Polna, Leśna, Wąska, Zielona", "note": null, "kind": "planned"}]}
{"id": 39495, "is_outage_notice": true, "is_past": false, "items": [{"date": "2026-09-29", "start": "08:00", "end": "16:00", "locality": "Lisie Jamy", "street": "Polna", "place_verbatim": "Lisie Jamy: ul. Polna", "note": null, "kind": "planned"}, {"date": "2026-09-29", "start": "08:00", "end": "16:00", "locality": "Basznia Górna", "street": null, "place_verbatim": "Basznia Górna od nr 92 do nr 120", "note": null, "kind": "planned"}, {"date": "2026-09-29", "start": "08:00", "end": "16:00", "locality": "Podlesie", "street": null, "place_verbatim": "Podlesie od nr 40 do nr 42", "note": null, "kind": "planned"}]}
{"id": 39699, "is_outage_notice": true, "is_past": false, "items": [{"date": "2026-10-02", "start": "08:00", "end": "16:00", "locality": "Basznia Górna", "street": null, "place_verbatim": "Basznia Górna od numeru 121 do numeru 144 (przysiółek Dąbrowa)", "note": null, "kind": "planned"}]}
{"id": 39720, "is_outage_notice": true, "is_past": false, "items": [{"date": "2026-10-08", "start": "08:00", "end": "16:00", "locality": "Opaka", "street": null, "place_verbatim": "Opaka", "note": null, "kind": "planned"}, {"date": "2026-10-08", "start": "08:00", "end": "16:00", "locality": "Dąbków", "street": null, "place_verbatim": "Dąbków", "note": null, "kind": "planned"}]}
{"id": 39744, "is_outage_notice": true, "is_past": false, "items": [{"date": "2026-10-14", "start": "08:00", "end": "16:00", "locality": "Tymce", "street": null, "place_verbatim": "Tymce od nr 1 do nr 69", "note": null, "kind": "planned"}]}
{"id": 39766, "is_outage_notice": true, "is_past": false, "items": [{"date": "2026-10-15", "start": "08:00", "end": "16:00", "locality": "Borowa Góra", "street": null, "place_verbatim": "Borowa Góra", "note": null, "kind": "planned"}, {"date": "2026-10-15", "start": "08:00", "end": "16:00", "locality": "Piastowo", "street": null, "place_verbatim": "Piastowo", "note": null, "kind": "planned"}, {"date": "2026-10-15", "start": "08:00", "end": "16:00", "locality": "Basznia Dolna", "street": null, "place_verbatim": "Basznia Dolna", "note": null, "kind": "planned"}, {"date": "2026-10-15", "start": "08:00", "end": "16:00", "locality": "Basznia Górna", "street": null, "place_verbatim": "Basznia Górna", "note": null, "kind": "planned"}, {"date": "2026-10-15", "start": "08:00", "end": "16:00", "locality": "Podlesie", "street": null, "place_verbatim": "Podlesie", "note": null, "kind": "planned"}, {"date": "2026-10-15", "start": "08:00", "end": "16:00", "locality": "Wólka Krowicka", "street": null, "place_verbatim": "Wólka Krowicka od nr 144 do nr 159", "note": null, "kind": "planned"}]}
{"id": 39855, "is_outage_notice": true, "is_past": false, "items": [{"date": "2026-10-16", "start": "08:00", "end": "16:00", "locality": "Lisie Jamy", "street": null, "place_verbatim": "Lisie Jamy", "note": null, "kind": "planned"}, {"date": "2026-10-16", "start": "08:00", "end": "16:00", "locality": "Wólka Krowicka", "street": null, "place_verbatim": "Wólka Krowicka", "note": null, "kind": "planned"}]}
{"id": 39857, "is_outage_notice": true, "is_past": false, "items": [{"date": "2026-10-19", "start": "08:00", "end": "16:00", "locality": "Lisie Jamy", "street": null, "place_verbatim": "Lisie Jamy", "note": null, "kind": "planned"}, {"date": "2026-10-19", "start": "08:00", "end": "16:00", "locality": "Wólka Krowicka", "street": null, "place_verbatim": "Wólka Krowicka", "note": null, "kind": "planned"}, {"date": "2026-10-19", "start": "08:00", "end": "16:00", "locality": "Krowica Sama", "street": null, "place_verbatim": "Krowica Sama", "note": null, "kind": "planned"}, {"date": "2026-10-19", "start": "08:00", "end": "16:00", "locality": "Krowica Hołodowska", "street": null, "place_verbatim": "Krowica Hołodowska", "note": null, "kind": "planned"}, {"date": "2026-10-19", "start": "08:00", "end": "16:00", "locality": "Budomierz", "street": null, "place_verbatim": "Budomierz", "note": null, "kind": "planned"}]}
{"id": 39863, "is_outage_notice": true, "is_past": false, "items": [{"date": "2026-10-20", "start": "08:00", "end": "16:00", "locality": "Wólka Krowicka", "street": null, "place_verbatim": "Wólka Krowicka", "note": null, "kind": "planned"}]}
{"id": 39865, "is_outage_notice": true, "is_past": false, "items": [{"date": "2026-10-21", "start": "08:00", "end": "12:00", "locality": "Dąbków", "street": null, "place_verbatim": "Dąbków", "note": null, "kind": "planned"}, {"date": "2026-10-21", "start": "08:00", "end": "12:00", "locality": "Lubaczów", "street": "Żuki", "place_verbatim": "Lubaczów ul. Żuki", "note": null, "kind": "planned"}, {"date": "2026-10-21", "start": "08:00", "end": "12:00", "locality": "Opaka", "street": null, "place_verbatim": "Opaka od nr 104 do nr 110", "note": null, "kind": "planned"}, {"date": "2026-10-21", "start": "08:00", "end": "16:00", "locality": "Piastowo", "street": null, "place_verbatim": "Piastowo", "note": null, "kind": "planned"}, {"date": "2026-10-21", "start": "08:00", "end": "16:00", "locality": "Basznia Dolna", "street": null, "place_verbatim": "Basznia Dolna", "note": null, "kind": "planned"}, {"date": "2026-10-21", "start": "08:00", "end": "16:00", "locality": "Basznia Górna", "street": null, "place_verbatim": "Basznia Górna", "note": null, "kind": "planned"}, {"date": "2026-10-21", "start": "08:00", "end": "16:00", "locality": "Podlesie", "street": null, "place_verbatim": "Podlesie", "note": null, "kind": "planned"}, {"date": "2026-10-21", "start": "08:00", "end": "16:00", "locality": "Młodów", "street": "Pilipy", "place_verbatim": "Młodów, ul. Pilipy", "note": null, "kind": "planned"}]}
{"id": 39868, "is_outage_notice": false, "is_past": false, "items": []}
{"id": 39872, "is_outage_notice": true, "is_past": false, "items": [{"date": "2026-10-22", "start": "08:00", "end": "16:00", "locality": "Wólka Krowicka", "street": null, "place_verbatim": "Wólka Krowicka", "note": null, "kind": "planned"}, {"date": "2026-10-22", "start": "08:00", "end": "16:00", "locality": "Karolówka", "street": "Sobieskiego", "place_verbatim": "Karolówka – ul. Sobieskiego od nr 23 do nr 47", "note": null, "kind": "planned"}, {"date": "2026-10-22", "start": "08:00", "end": "16:00", "locality": "Młodów", "street": "Warszawska", "place_verbatim": "Młodów – ul. Warszawska", "note": null, "kind": "planned"}, {"date": "2026-10-22", "start": "08:00", "end": "16:00", "locality": "Młodów", "street": "Rzeczna", "place_verbatim": "Młodów – ul. Warszawska, Rzeczna", "note": null, "kind": "planned"}, {"date": "2026-10-22", "start": "08:00", "end": "16:00", "locality": "Młodów", "street": "Krótka", "place_verbatim": "Młodów – ul. Warszawska, Rzeczna, Krótka", "note": null, "kind": "planned"}, {"date": "2026-10-22", "start": "08:00", "end": "16:00", "locality": "Młodów", "street": "Wodna", "place_verbatim": "Młodów – ul. Warszawska, Rzeczna, Krótka, Wodna", "note": null, "kind": "planned"}]}
{"id": 39885, "is_outage_notice": true, "is_past": false, "items": [{"date": "2026-10-26", "start": "08:00", "end": "16:00", "locality": "Lisie Jamy", "street": null, "place_verbatim": "Lisie Jamy", "note": null, "kind": "planned"}, {"date": "2026-10-27", "start": "08:00", "end": "16:00", "locality": "Dąbków", "street": null, "place_verbatim": "Dąbków", "note": null, "kind": "planned"}, {"date": "2026-10-27", "start": "08:00", "end": "16:00", "locality": "Lubaczów", "street": "Żuki", "place_verbatim": "Lubaczów ul. Żuki", "note": null, "kind": "planned"}, {"date": "2026-10-27", "start": "08:00", "end": "16:00", "locality": "Opaka", "street": null, "place_verbatim": "Opaka od numeru 104 do 110", "note": null, "kind": "planned"}, {"date": "2026-10-28", "start": "08:00", "end": "16:00", "locality": "Załuże", "street": null, "place_verbatim": "Załuże–Podłęże od numeru 44 do numeru 92", "note": "Podłęże", "kind": "planned"}, {"date": "2026-10-28", "start": "08:00", "end": "16:00", "locality": "Bałaje", "street": null, "place_verbatim": "Bałaje", "note": null, "kind": "planned"}, {"date": "2026-10-28", "start": "08:00", "end": "16:00", "locality": "Lubaczów", "street": "Przemysłowa", "place_verbatim": "ul. Przemysłowa (Lubaczów)", "note": null, "kind": "planned"}, {"date": "2026-10-28", "start": "08:00", "end": "16:00", "locality": "Antoniki", "street": null, "place_verbatim": "Antoniki", "note": null, "kind": "planned"}, {"date": "2026-10-28", "start": "08:00", "end": "16:00", "locality": "Młodów", "street": "Pilipy", "place_verbatim": "Młodów ul. Pilipy", "note": null, "kind": "planned"}, {"date": "2026-10-28", "start": "08:00", "end": "16:00", "locality": "Piastowo", "street": null, "place_verbatim": "Piastowo", "note": null, "kind": "planned"}, {"date": "2026-10-28", "start": "08:00", "end": "16:00", "locality": "Basznia Dolna", "street": null, "place_verbatim": "Basznia Dolna", "note": null, "kind": "planned"}, {"date": "2026-10-28", "start": "08:00", "end": "16:00", "locality": "Basznia Górna", "street": null, "place_verbatim": "Basznia Górna", "note": null, "kind": "planned"}, {"date": "2026-10-28", "start": "08:00", "end": "16:00", "locality": "Podlesie", "street": null, "place_verbatim": "Podlesie", "note": null, "kind": "planned"}, {"date": "2026-10-29", "start": "08:00", "end": "16:00", "locality": "Wólka Krowicka", "street": null, "place_verbatim": "Wólka Krowicka", "note": null, "kind": "planned"}, {"date": "2026-10-29", "start": "08:00", "end": "16:00", "locality": "Lisie Jamy", "street": null, "place_verbatim": "Lisie Jamy", "note": null, "kind": "planned"}]}
`;

const READINGS_B = new Map(
  REPLIES_B.trim()
    .split("\n")
    .map((line) => {
      const { id, ...result } = JSON.parse(line) as AiResult & { id: number };
      return [id, result];
    }),
);

/** The model's reading of a real post with the context prompt. */
export function readingB(id: number): AiResult {
  const r = READINGS_B.get(id);
  if (!r) throw new Error(`no reading of ${id}`);
  return structuredClone(r);
}

export const READ_B = [...READINGS_B.keys()];

/**
 * What the posts say, by hand: [post, date, start, end, locality id,
 * street id or null for the whole locality, houses]. Załuże–Podłęże is
 * part of Załuże, 39699's "(przysiółek Dąbrowa)" Basznia Górna's Dąbrowa.
 */
export const TRUTH: Array<
  [
    post: number,
    date: string,
    start: string | null,
    end: string | null,
    localityId: string,
    streetId: string | null,
    houses: "whole" | "ranges" | "unknown",
  ]
> = [
  [39885, "2026-10-26", "08:00", "16:00", "0606234", null, "whole"],
  [39885, "2026-10-27", "08:00", "16:00", "0606004", null, "whole"],
  [39885, "2026-10-27", "08:00", "16:00", "0972447", "0972447-26555", "whole"],
  [39885, "2026-10-27", "08:00", "16:00", "0606317", null, "ranges"],
  [39885, "2026-10-28", "08:00", "16:00", "0606464", null, "ranges"],
  [39885, "2026-10-28", "08:00", "16:00", "0605878", null, "whole"],
  [39885, "2026-10-28", "08:00", "16:00", "0972447", "0972447-17742", "whole"],
  [39885, "2026-10-28", "08:00", "16:00", "0606292", null, "whole"],
  [39885, "2026-10-28", "08:00", "16:00", "0606286", "0606286-39507", "whole"],
  [39885, "2026-10-28", "08:00", "16:00", "0606352", null, "whole"],
  [39885, "2026-10-28", "08:00", "16:00", "0605890", null, "whole"],
  [39885, "2026-10-28", "08:00", "16:00", "0605950", null, "whole"],
  [39885, "2026-10-28", "08:00", "16:00", "0606369", null, "whole"],
  [39885, "2026-10-29", "08:00", "16:00", "0606441", null, "whole"],
  [39885, "2026-10-29", "08:00", "16:00", "0606234", null, "whole"],
  [39872, "2026-10-22", "08:00", "16:00", "0606441", null, "whole"],
  [39872, "2026-10-22", "08:00", "16:00", "0606116", "0606116-20431", "ranges"],
  [39872, "2026-10-22", "08:00", "16:00", "0606286", "0606286-23682", "whole"],
  [39872, "2026-10-22", "08:00", "16:00", "0606286", "0606286-19326", "whole"],
  [39872, "2026-10-22", "08:00", "16:00", "0606286", "0606286-10009", "whole"],
  [39872, "2026-10-22", "08:00", "16:00", "0606286", "0606286-24550", "whole"],
  [39865, "2026-10-21", "08:00", "12:00", "0606004", null, "whole"],
  [39865, "2026-10-21", "08:00", "12:00", "0972447", "0972447-26555", "whole"],
  [39865, "2026-10-21", "08:00", "12:00", "0606317", null, "ranges"],
  [39865, "2026-10-21", "08:00", "16:00", "0606352", null, "whole"],
  [39865, "2026-10-21", "08:00", "16:00", "0605890", null, "whole"],
  [39865, "2026-10-21", "08:00", "16:00", "0605950", null, "whole"],
  [39865, "2026-10-21", "08:00", "16:00", "0606369", null, "whole"],
  [39865, "2026-10-21", "08:00", "16:00", "0606286", "0606286-39507", "whole"],
  [39863, "2026-10-20", "08:00", "16:00", "0606441", null, "whole"],
  [38969, "2026-09-07", "08:00", "16:00", "0606286", "0606286-05083", "whole"],
  [38969, "2026-09-08", "08:00", "16:00", "0606286", "0606286-05083", "whole"],
  [38890, "2026-09-02", "08:00", "16:00", "0606116", "0606116-20431", "ranges"],
  [35690, "2025-12-21", "22:00", "05:00", "0606234", null, "whole"],
  [35690, "2025-12-21", "22:00", "05:00", "0606441", null, "whole"],
  [35690, "2025-12-21", "22:00", "05:00", "0606180", null, "whole"],
  [35690, "2025-12-21", "22:00", "05:00", "0606122", null, "whole"],
  [35690, "2025-12-21", "22:00", "05:00", "0605996", null, "whole"],
  [35661, "2025-12-16", null, "19:00", "0606234", null, "whole"],
  [35661, "2025-12-16", null, "19:00", "0606441", null, "whole"],
  [35661, "2025-12-16", null, "19:00", "0606180", null, "whole"],
  [35661, "2025-12-16", null, "19:00", "0606122", null, "whole"],
  [35661, "2025-12-16", null, "19:00", "0605996", null, "whole"],
  [39857, "2026-10-19", "08:00", "16:00", "0606234", null, "whole"],
  [39857, "2026-10-19", "08:00", "16:00", "0606441", null, "whole"],
  [39857, "2026-10-19", "08:00", "16:00", "0606180", null, "whole"],
  [39857, "2026-10-19", "08:00", "16:00", "0606122", null, "whole"],
  [39857, "2026-10-19", "08:00", "16:00", "0605996", null, "whole"],
  [39855, "2026-10-16", "08:00", "16:00", "0606234", null, "whole"],
  [39855, "2026-10-16", "08:00", "16:00", "0606441", null, "whole"],
  [39766, "2026-10-15", "08:00", "16:00", "0605980", null, "whole"],
  [39766, "2026-10-15", "08:00", "16:00", "0606352", null, "whole"],
  [39766, "2026-10-15", "08:00", "16:00", "0605890", null, "whole"],
  [39766, "2026-10-15", "08:00", "16:00", "0605950", null, "whole"],
  [39766, "2026-10-15", "08:00", "16:00", "0606369", null, "whole"],
  [39766, "2026-10-15", "08:00", "16:00", "0606441", null, "ranges"],
  [39744, "2026-10-14", "08:00", "16:00", "0606435", null, "ranges"],
  [39720, "2026-10-08", "08:00", "16:00", "0606317", null, "whole"],
  [39720, "2026-10-08", "08:00", "16:00", "0606004", null, "whole"],
  [39699, "2026-10-02", "08:00", "16:00", "0605967", null, "ranges"],
  [39495, "2026-09-29", "08:00", "16:00", "0606234", "0606234-17011", "whole"],
  [39495, "2026-09-29", "08:00", "16:00", "0605950", null, "ranges"],
  [39495, "2026-09-29", "08:00", "16:00", "0606369", null, "ranges"],
  [39460, "2026-09-24", "08:00", "16:00", "0606234", "0606234-11467", "ranges"],
  [39460, "2026-09-24", "08:00", "16:00", "0606234", "0606234-03839", "whole"],
  [39460, "2026-09-24", "08:00", "16:00", "0606234", "0606234-17011", "whole"],
  [39460, "2026-09-24", "08:00", "16:00", "0606234", "0606234-10898", "whole"],
  [39460, "2026-09-24", "08:00", "16:00", "0606234", "0606234-23795", "whole"],
  [39460, "2026-09-24", "08:00", "16:00", "0606234", "0606234-26081", "whole"],
  [39304, "2026-09-15", "08:00", "16:00", "0606286", "0606286-10898", "whole"],
  [39304, "2026-09-15", "08:00", "16:00", "0606286", "0606286-23682", "whole"],
  [39304, "2026-09-15", "08:00", "16:00", "0606286", "0606286-19326", "whole"],
  [39304, "2026-09-15", "08:00", "16:00", "0606286", "0606286-24550", "whole"],
  [39304, "2026-09-15", "08:00", "16:00", "0606286", "0606286-01465", "whole"],
  [39304, "2026-09-15", "08:00", "16:00", "0606286", "0606286-19585", "whole"],
  [39304, "2026-09-15", "08:00", "16:00", "0606286", "0606286-20254", "whole"],
  [39304, "2026-09-15", "08:00", "16:00", "0606286", "0606286-16033", "whole"],
  [39304, "2026-09-15", "08:00", "16:00", "0606286", "0606286-10009", "whole"],
  [39304, "2026-09-15", "08:00", "16:00", "0606116", "0606116-20431", "ranges"],
  [39160, "2026-09-14", "08:00", "16:00", "0606234", "0606234-03839", "ranges"],
  [34394, "2025-10-09", null, "17:00", "0606010", null, "whole"],
  [34394, "2025-10-09", null, "17:00", "0606168", null, "whole"],
  [26028, "2024-04-09", "10:00", "15:00", "0605878", null, "unknown"],
  [
    26028,
    "2024-04-09",
    "10:00",
    "15:00",
    "0972447",
    "0972447-17742",
    "unknown",
  ],
  [26028, "2024-04-10", "09:00", "15:00", "0606292", null, "whole"],
  [26028, "2024-04-10", "09:00", "15:00", "0605878", null, "whole"],
  [26028, "2024-04-10", "09:00", "15:00", "0606286", "0606286-39507", "whole"],
  [26028, "2024-04-10", "09:00", "15:00", "0606464", null, "unknown"],
  [26028, "2024-04-12", "09:00", "15:00", "0606292", null, "whole"],
  [26028, "2024-04-12", "09:00", "15:00", "0605878", null, "whole"],
  [26028, "2024-04-12", "09:00", "15:00", "0606286", "0606286-39507", "whole"],
  [26028, "2024-04-12", "09:00", "15:00", "0606464", null, "unknown"],
  [26028, "2024-04-11", "09:00", "15:00", "0606352", null, "whole"],
  [24161, "2023-11-23", "09:00", "15:00", "0606464", null, "whole"],
  [24161, "2023-11-23", "09:00", "15:00", "0606435", null, "whole"],
  [24161, "2023-11-24", "09:00", "15:00", "0606464", null, "whole"],
  [24161, "2023-11-24", "09:00", "15:00", "0606435", null, "whole"],
  [24161, "2023-11-27", "09:00", "15:00", "0606464", null, "whole"],
  [24161, "2023-11-27", "09:00", "15:00", "0606435", null, "whole"],
  [24161, "2023-11-28", "09:00", "15:00", "0606464", null, "whole"],
  [24161, "2023-11-28", "09:00", "15:00", "0606435", null, "whole"],
  [23860, "2023-11-02", "09:00", "15:00", "0606435", null, "whole"],
  [23860, "2023-11-02", "09:00", "15:00", "0606464", null, "whole"],
  [23860, "2023-11-03", "09:00", "15:00", "0606435", null, "whole"],
  [23860, "2023-11-03", "09:00", "15:00", "0606464", null, "whole"],
  [23860, "2023-11-06", "09:00", "15:00", "0606435", null, "whole"],
  [23860, "2023-11-06", "09:00", "15:00", "0606464", null, "whole"],
  [23860, "2023-11-07", "09:00", "15:00", "0606435", null, "whole"],
  [23860, "2023-11-07", "09:00", "15:00", "0606464", null, "whole"],
  [23860, "2023-11-08", "09:00", "15:00", "0606435", null, "whole"],
  [23860, "2023-11-08", "09:00", "15:00", "0606464", null, "whole"],
  [23860, "2023-11-09", "09:00", "15:00", "0606435", null, "whole"],
  [23860, "2023-11-09", "09:00", "15:00", "0606464", null, "whole"],
  [23860, "2023-11-10", "09:00", "15:00", "0606435", null, "whole"],
  [23860, "2023-11-10", "09:00", "15:00", "0606464", null, "whole"],
  [14117, "2021-12-15", null, "13:00", "0606286", null, "whole"],
  [14117, "2021-12-15", null, "13:00", "0606116", null, "whole"],
];
