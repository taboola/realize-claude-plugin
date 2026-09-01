# Reports skill — gaps & needs

Short audit of `skills/reports/` against three asks: **aggregation rules, join keys, general guidelines.**

## Gaps

### 1. Aggregation rules — missing
The skill does not tell the model how to roll rows up. Default behavior (averaging rate columns across rows) is wrong.

Needs:
- **Sum vs. ratio columns** — `impressions`, `clicks`, `spent`, `conversions` sum. `ctr`, `cpc`, `cvr`, `roas` do **not**.
- **Weighted re-derivation** — after any filter or slice:
  - `CTR = Σclicks / Σimpressions`
  - `CPC = Σspent / Σclicks`
  - `CVR = Σconversions / Σclicks`
- **Never** `mean(ctr)` / `mean(cpc)` / `mean(cvr)` across rows.
- **Grain awareness** — each report has a fixed row-grain; summing across the wrong grain double-counts:
  | Report | Row grain |
  |---|---|
  | `get_top_campaign_content_report` | item × window |
  | `get_campaign_breakdown_report` | campaign × window |
  | `get_campaign_history_report` | campaign × date |
  | `get_campaign_site_day_breakdown_report` | campaign × site × date |

### 2. Join keys — missing
`references/report-fields.md` lists ID columns but never states how to align reports.

Needs:
- `top_campaign_content` ↔ `breakdown` → join on `campaign_id` (item rolls up to campaign).
- `history` ↔ `site_day_breakdown` → join on `(campaign_id, date)`; `site_day` is finer.
- `item_id` ↔ `campaigns` skill (`get_item`) → for creative metadata.
- **IDs are opaque strings.** Do not cast to int when comparing across reports.

### 3. General guidelines — thin
`SKILL.md` "Interpretation guidelines" covers dates, citing numbers, empty results, missing sort. Missing:

- **Like-for-like period comparison** — equal length, DOW-aligned windows when comparing.
- **Currency assumption** — `spent` is in account currency. Do not sum across accounts.
- **Date / timezone** — `date` column has no TZ. Do not silently assume UTC or local; surface the assumption.
- **Field-list caveat** — `report-fields.md:3` notes columns are illustrative, not schema-derived. This caveat should also appear in `SKILL.md` so the model verifies field names against real output before quoting.

## Suggested action

Add one new section to `skills/reports/SKILL.md` — **"Aggregation, joins, and grain"** (≤30 lines) — covering the three buckets above. Leave attribution/precision/scope footer in `os/guardrails.md` where they already live.

---

## Status update — 2026-09-01 (dynamic-report migration)

This audit was written against the four fixed-grain report tools. The dynamic report (`get_dynamic_report_settings` + `get_dynamic_report_data`) supersedes three of them (`get_campaign_history_report` remains, reframed as the change/audit log), which changes the picture:

- **Gap 1 (aggregation rules) — closed.** Sum-vs-ratio columns, weighted re-derivation, and grain awareness are now in `knowledge/reporting-aggregation.md`. Grain is no longer fixed per tool — it is whatever dimension set the query requests, and the response banner states it.
- **Gap 2 (join keys) — largely obsolete.** Cross-report joins existed because each fixed tool served one grain; the dynamic report queries the combined grain directly. The one surviving rule: IDs stay opaque strings.
- **Gap 3 (general guidelines) — partially closed.** Like-for-like windows, currency, and timezone caveats remain good practice; the field-list caveat now points at the metamodel as the only authoritative field source.
