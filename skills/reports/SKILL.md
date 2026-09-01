---
name: reports
description: Pull Realize performance reports (CSV) and interpret them. Covers the metamodel-driven dynamic report (any dimension × metric combination — campaign, ad, site, day/week, country, platform, browser, OS) plus the campaign-history change log, with the mandatory settings-first workflow, filter/sort rules, and pagination.
allowed-tools: ["Read", "Bash", "AskUserQuestion"]
---

# Reports

Wraps the Realize MCP reporting tools. Reports return **CSV**, not JSON — interpret the output in prose rather than dumping it back at the user.

Performance questions are answered by the **dynamic report**, a two-tool pair: first fetch the metamodel (the menu of every dimension, metric, and filterable field), then build and run the query. The fixed-grain report tools that predated it (`get_top_campaign_content_report`, `get_campaign_breakdown_report`, `get_campaign_site_day_breakdown_report`) are **retired from the live tool surface** — do not call them. Campaign *change history* (an audit log, not performance data) keeps its own tool.

## Prerequisites

- `account_id` resolved via the `accounts` skill.
- Reporting works on **PARTNER** (advertiser) and **NETWORK** accounts. **GROUP accounts and admin networks return 403 by design** — that's not an auth problem; pick a PARTNER or NETWORK account instead of retrying or re-authenticating.

## Tools this skill wraps

| Tool | Role |
|---|---|
| `mcp__realize-mcp__get_dynamic_report_settings` | **Required first step.** Returns the metamodel: every dimension, metric, and filterable field with its allowed operators, as fully-qualified names. |
| `mcp__realize-mcp__get_dynamic_report_data` | Builds and executes the query — any combination of the metamodel's dimensions and metrics. |
| `mcp__realize-mcp__get_campaign_history_report` | Campaign **change/audit log** — who changed what, when. NOT performance data; the dynamic report does not replace it and it does not answer performance questions. |

## The mandatory two-step workflow

1. `search_accounts` → `account_id`.
2. `get_dynamic_report_settings(account_id)` → scan the returned menu and copy the **exact fully-qualified names** (e.g. `PERFORMANCE_REPORT.CAMPAIGN.CAMPAIGN_NAME`, `PERFORMANCE_REPORT.METRICS.CLICKS`). **Never guess or fabricate a field name** — the metamodel is the only source of valid names and operators. Use `name_filter` (case-insensitive substring) to find a specific field or shrink a large surface (e.g. an account with many conversion rules).
3. `get_dynamic_report_data(account_id, columns=[...], date_preset or date_from+date_to, ...)` with names copied verbatim from step 2.

Skipping step 2 and guessing names is the tool's own documented failure mode — a wrong name costs a round-trip at best and a misleading 400 at worst.

## Query rules

- **Dates are required, one way or the other:** pass EITHER `date_preset` (one of `YESTERDAY`, `LAST_7_DAYS`, `LAST_14_DAYS`, `LAST_30_DAYS`, `LAST_90_DAYS`, `THIS_MONTH`, `LAST_MONTH`, `THIS_QUARTER`, `LAST_QUARTER`, `THIS_YEAR`, `LAST_12_MONTHS`) OR a custom range `date_from` + `date_to` (`yyyy-MM-dd`) — never both.
- **Filters** are structured objects: `{"name": <fully-qualified field>, "operator": <op>, "values": [<strings>]}`. Operators: `EQUALS`, `NOT_EQUALS`, `IN`, `NOT_IN`, `GREATER_THAN`, `LESS_THAN`, `BETWEEN`, `LIKE`. Which operators a field accepts is stated in the metamodel. `ACCOUNT_ID` and the date filter are **auto-injected** — never add them yourself.
- **Sort**: each `sort` entry names a column that is **also present in `columns`**, plus `ASC`/`DESC`. For "top N by X": include X in `columns`, sort `[{"column": X, "direction": "DESC"}]`, set `page_size=N`.
- **Pagination**: `page` (default 1) and `page_size` (1–100, default 20). The API requires the pair; the tool backfills whichever is omitted.
- `report_type` is `PERFORMANCE` — currently the only supported value.

## CSV output format

`get_dynamic_report_data` returns CSV with a summary banner stating **Records, the row Grain, and pagination**, matching the retired report tools' format. Two differences from that legacy format matter:

- **There is no grand `Total` in the metadata.** You cannot know the full row count without paging to the end. State the scope you actually fetched ("first 100 rows by spend") instead of implying completeness.
- **The Grain line tells you what one row is.** Read it back before aggregating — it's the dimension combination you requested.

`get_campaign_history_report` keeps the legacy banner (`📊 Records: … | Total: … | Page: … | Size: …`) — there, cite `Total`.

## Pagination and aggregation

- Keep `page_size` constant across pages of one query.
- **No `Total` means the stop rule changes:** page until a page comes back with fewer than `page_size` rows — that's the last one. Never aggregate a sum/mean/ranking from page 1 alone unless page 1 was short.
- Prefer making the **server** do the aggregation: request exactly the dimensions you want rolled up (e.g. `columns=[WEEK, CLICKS]` for weekly clicks) rather than pulling day-grain rows and summing client-side.
- The full aggregation discipline (sum-reconciliation gate, rate-metric rules) lives in `knowledge/reporting-aggregation.md` — it applies to every aggregated number you quote.

## Known behaviors and traps

*Observed on the 2026-08-20 staging validation (10-question comparison run). Re-verify any that block an answer — some may have been fixed before the production release.*

- **Rate metrics may not match the UI or older exports: CTR here = clicks / *visible* impressions**, not all impressions. Same account, same weeks measured both ways: 0.56–0.63% vs 0.40–0.48%. If the user compares against another surface and sees a gap in rates while raw counters match, this definition difference is the first suspect — say so instead of calling either number wrong.
- **Week buckets start on Sunday**, and the first bucket's label can be a date *before* your requested range (window starting Mon Jun 29 → first bucket labeled Jun 28). Echo the actual bucket boundaries in your summary.
- **Entity-attribute dimensions may not aggregate.** Time dimensions (Day/Week), targeting dimensions (Platform, OS, Site, Country) and entity grains (Campaign, Ad) roll up correctly; attribute columns of an entity (e.g. campaign bidding strategy, Ad CTA) have returned raw per-entity rows with the attribute as a label — hundreds of rows for a two-column report, the same dimension pair repeated with different numbers. If row count explodes for a small dimension combination, check for repeated dimension values and aggregate client-side (per the aggregation knowledge file) rather than presenting duplicates.
- **Site names**: `SITE.NAME` has returned 400 "Selectable conditions are not fit"; the working human-readable column is `SITE.DESCRIPTION`.
- **Raw counters are trustworthy.** In the validation run every raw counter (spend, clicks, impressions, conversions) matched the legacy tools exactly; filters, server-side sort, and top-N paging all worked.

## Typical flows

**"Top-spending content last week."**
1. `get_dynamic_report_settings(account_id)` → find the ad/item name and spend columns.
2. `get_dynamic_report_data(columns=[<item name>, <campaign name>, <spent>, <clicks>], date_preset="LAST_7_DAYS", sort=[{column: <spent>, direction: "DESC"}], page_size=20)`.
3. Summarize the top 3–5 rows in prose, including absolute spend and share of what was fetched.

**"Why is CPC up on campaign X?"**
1. Settings, then a Day-grain query filtered to the campaign: `columns=[<day>, <clicks>, <spent>, <cpc>]`, `filters=[{name: <campaign id/name field>, operator: "EQUALS", values: ["<X>"]}]`, covering a window before and after the change.
2. Compare the recent period against the prior equivalent window. Report the delta and likely driver.
3. If the *cause* might be a settings change, pull `get_campaign_history_report` for the same window — that's the change log — and line changes up against the metric inflection.

**"Break down my biggest campaign by site."**
1. Campaign grain first: spend by campaign, sort DESC, `page_size=1` → the biggest campaign.
2. Site grain filtered to it: `columns=[SITE.DESCRIPTION-equivalent, <spent>, <clicks>, <ctr>]`, campaign filter, sort by spend DESC.
3. Report top sites by spend, CTR, CPC.

**"What changed on this campaign recently?"** → `get_campaign_history_report` (audit log), not the dynamic report.

## Interpretation guidelines

1. **Always translate relative dates.** "Last week" → an explicit preset or ISO range in the call, and echo the resolved range back in your summary.
2. **Cite numbers, not adjectives.** "Top-performing" is meaningless without the spend/CTR figure next to it.
3. **Zero rows** → say "no records for this query" explicitly; don't make up narrative from an empty report.
4. **State fetched scope honestly.** Without a grand `Total`, say what you pulled ("top 50 rows by spend; more exist") rather than implying the full universe.

*(Attribution + timeframe rules for CPA / CVR / Leads / ROAS are enforced globally by `os/guardrails.md` § "Metrics and attribution" — they apply to every report summary you produce.)*

## Gotchas

- **CSV, not JSON.** Report tools differ from campaign/account tools in response format.
- **Settings first, always.** Column and filter names are metamodel-defined per account (custom conversion metrics vary by account) — a name that worked on one account may not exist on another.
- **Large pulls are slow.** Ask before paginating beyond the first 3 pages.
- **History ≠ performance.** `get_campaign_history_report` answers "what changed", not "how did it perform". Routing a trend question there (or a change question to the dynamic report) is a wrong-tool miss.

See `references/report-fields.md` for the metamodel structure and `references/csv-examples.md` for sample outputs.
