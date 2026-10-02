---
name: reports
description: Pull Realize performance reports (CSV) and interpret them. Covers the metamodel-driven dynamic report (any dimension × metric combination — e.g. campaign, ad, site, day/week, country, platform, browser, OS), the classic campaign-breakdown report that still serves GROUP and admin-network accounts, and the campaign-history change log, with the mandatory settings-first workflow, filter/sort rules, and pagination.
allowed-tools: ["Read", "Bash", "AskUserQuestion"]
---

# Reports

Wraps the Realize MCP reporting tools. Reports return **CSV**, not JSON — interpret the output in prose rather than dumping it back at the user.

Performance questions are normally answered by the **dynamic report**, a two-tool pair: first fetch the metamodel (the menu of every dimension, metric, and filterable field), then build and run the query.

Two of the fixed-grain tools that predated it — `get_top_campaign_content_report` and `get_campaign_site_day_breakdown_report` — are **retired from the live tool surface**; do not call them. **`get_campaign_breakdown_report` was not retired.** It still ships, and it is the *only* report that serves **GROUP and admin-network accounts**, which the dynamic report cannot (403). Campaign *change history* (an audit log, not performance data) keeps its own tool.

## Prerequisites

- `account_id` resolved via the `accounts` skill.
- The **dynamic report** works on **PARTNER** (advertiser) and **NETWORK** accounts. On a **GROUP or admin-network** account both dynamic tools return **403 by design** — that is not an auth problem, so do not retry or re-authenticate. **Switch to `get_campaign_breakdown_report`**, which serves every account type. Never tell the user to "pick a different account" when their account type simply needs the other tool.

## Tools this skill wraps

| Tool | Role |
|---|---|
| `mcp__realize-mcp__get_dynamic_report_settings` | **Required first step.** Returns the metamodel: every dimension, metric, and filterable field with its allowed operators, as fully-qualified names. |
| `mcp__realize-mcp__get_dynamic_report_data` | Builds and executes the query — any combination of the metamodel's dimensions and metrics. |
| `mcp__realize-mcp__get_campaign_breakdown_report` | Classic campaign-grain performance report (one row per campaign). **Still live.** The required path for **GROUP / admin-network** accounts, and a valid shortcut when the question really is just "metrics per campaign". |
| `mcp__realize-mcp__get_campaign_history_report` | Campaign **change/audit log** — who changed what, when. NOT performance data; the dynamic report does not replace it and it does not answer performance questions. |

## Choosing the report tool

1. **`type` is `GROUP`?** → `get_campaign_breakdown_report`. The dynamic tools 403 on those. Route on `type` up front rather than discovering it from an error.
   - **Admin networks are the awkward case.** Upstream documents `PARTNER` and `NETWORK` as the reporting-capable types and says results *may also include* GROUP accounts and admin networks — without pinning down what `type` an admin network reports. So read `type` and trust it when it says `GROUP`, but don't assume `NETWORK` guarantees the dynamic report will work. If a dynamic call 403s on an account that looked fine, that is the admin-network case: switch to `get_campaign_breakdown_report` and carry on.
2. **Question is campaign-grain only** (spend/clicks/CTR per campaign, no further breakdown)? → either tool works. `get_campaign_breakdown_report` answers in one call and gives you a grand `Total`; the dynamic report needs the settings round-trip first.
3. **Anything else** — a dimension other than campaign, or two dimensions crossed (site, day/week, country, platform, OS, ad) → the **dynamic report**.

## The mandatory two-step workflow (dynamic report)

This applies to the dynamic report only — `get_campaign_breakdown_report` and `get_campaign_history_report` are single calls with no settings step.

1. `search_accounts` → `account_id`.
2. `get_dynamic_report_settings(account_id)` → scan the returned menu and copy the **exact fully-qualified names** (e.g. `PERFORMANCE_REPORT.CAMPAIGN.CAMPAIGN_NAME`, `PERFORMANCE_REPORT.METRICS.CLICKS`). **Never guess or fabricate a field name** — the metamodel is the only source of valid names and operators. Use `name_filter` (case-insensitive substring) to find a specific field or shrink a large surface (e.g. an account with many conversion rules).
3. `get_dynamic_report_data(account_id, columns=[...], date_preset or date_from+date_to, ...)` with names copied verbatim from step 2.

Skipping step 2 and guessing names is the tool's own documented failure mode — a wrong name costs a round-trip at best and a misleading 400 at worst.

## Query rules (dynamic report)

- **Dates are required, one way or the other:** pass EITHER `date_preset` (one of `YESTERDAY`, `LAST_7_DAYS`, `LAST_14_DAYS`, `LAST_30_DAYS`, `LAST_90_DAYS`, `THIS_MONTH`, `LAST_MONTH`, `THIS_QUARTER`, `LAST_QUARTER`, `THIS_YEAR`, `LAST_12_MONTHS`) OR a custom range `date_from` + `date_to` (`yyyy-MM-dd`) — never both.
- **A custom range may span at most 12 months**, and `date_to` **must not be later than today in UTC**. For exactly the last twelve months use `date_preset=LAST_12_MONTHS` rather than a custom range. For anything longer, split into consecutive sub-ranges and say so — don't silently truncate the window the user asked for.
- **Filters** are structured objects: `{"name": <fully-qualified field>, "operator": <op>, "values": [<strings>]}`. Operators: `EQUALS`, `NOT_EQUALS`, `IN`, `NOT_IN`, `GREATER_THAN`, `LESS_THAN`, `BETWEEN`, `LIKE`. Which operators a field accepts is stated in the metamodel. `ACCOUNT_ID` and the date filter are **auto-injected** — never add them yourself.
- **Sort**: each `sort` entry names a column that is **also present in `columns`**, plus `ASC`/`DESC`. For "top N by X": include X in `columns`, sort `[{"column": X, "direction": "DESC"}]`, set `page_size=N`.
- **Pagination**: `page` (default 1) and `page_size` (1–100, default 20). The API requires the pair; the tool backfills whichever is omitted.
- **At most 2 targeting sub-groups in `columns`.** A targeting column's sub-group is its name minus the last segment, so `TARGETING.COUNTRY.NAME` + `TARGETING.COUNTRY.CODE` is *one* sub-group, but `TARGETING.OS.FAMILY` + `TARGETING.OS_VERSION` is *two*. Country+Region is fine; Country+Platform+OS is over the limit. Columns within a sub-group are unlimited and non-targeting columns never count. **Count your targeting sub-groups before you call** — upstream describes the over-limit case both as *rejected* and as *extra columns dropped with the response naming them*, so handle both: if the call errors, split the query; if it succeeds, check the response for a dropped-column notice before trusting the grain. Never assume the grain you asked for is the grain you got. The clean fix either way is to split into two reports or move one dimension into `filters`, which never count toward the limit.
- **`LIKE` is substring-matched.** A value with no `%` is wrapped as `%value%` automatically. Pass your own `%` to control it: `"NDTV%"` for prefix, `"%Mobile"` for suffix.
- **The impressions columns are named the opposite of what you'd guess.** `METRICS.VISIBLE_IMPRESSIONS` is labelled **`Impressions`** in the output, and `METRICS.IMPRESSIONS` is labelled **`Served Ads`**. Realize's "Impressions" means *visible* impressions, and the report's CTR is computed on that column. Asking for `METRICS.IMPRESSIONS` because the user said "impressions" silently returns served ads — a much larger number — so state which basis you used whenever you quote an impression count or a CTR.
- **Output values are formatted, not raw.** Rates arrive as percentage strings (`"1.44%"`), large integers are comma-grouped and quoted (`"105,898"`), and the CSV header row carries **friendly labels** (`Clicks`, `Served Ads`), not the fully-qualified names you passed. Strip commas before arithmetic and match columns by header label.
- `report_type` is `PERFORMANCE` — currently the only supported value.

## `get_campaign_breakdown_report` (classic, still live)

One row per campaign; the campaign id column is `campaign`. Required: `account_id`, `start_date`, `end_date` (`YYYY-MM-DD`).

- **Serves every account type**, GROUP and admin-network included. That is its reason to exist now.
- Sorting is **off unless you ask for it**: `sort_field` has no default and accepts only `clicks`, `spent`, `impressions`; `sort_direction` (`ASC`/`DESC`) defaults to `DESC` and only takes effect once `sort_field` is set. `page` / `page_size` (1–100, default 20). `filters` is a **flat** key/value object here — not the dynamic report's structured `{name, operator, values}` form.
- **It has a grand `Total`** in the summary line — and `Total` is a **record count** (how many campaigns matched), *not* a spend total. Use it to know whether you have every row; it tells you nothing about what the rows sum to. To report total spend you must still page through and sum `spent` yourself.
- `ctr`, `cpc`, `cpm`, `cpa`, `cvr`, `roas` are computed **server-side per row** — use them as-is, never recompute or average them across rows. To aggregate volume, sum only `clicks`, `impressions`, `spent`.
- Identify columns **by name, not position** — column order is not guaranteed, and the real column list is wide (traffic-allocation, demand type, learning state, and the `roas_*` / `cpa_*` families beyond the headline metrics).
- **Rate columns are bare numbers already in percent units** — a `ctr` of `0.0202` means **0.0202%**, so do not multiply by 100 again. Same for `vctr` and `cpa_conversion_rate*`. **This differs from the dynamic report, which returns CTR as a pre-formatted string with a `%` sign (`"1.44%"`).** Never carry a formatting convention from one tool to the other; if a rate looks surprising, re-derive it from the row's own clicks and impressions.
- **`ctr` and `vctr` are separate columns** — `ctr` is clicks ÷ impressions, `vctr` is clicks ÷ *visible* impressions. The dynamic report has only the visible-impressions one, so a CTR gap between the two reports is usually this, not a data error.
- The banner also carries a **`Row key:`** line naming the columns that make a row unique — never merge or dedupe on a subset of it — and a `More data available` hint when further pages exist.
- **On timeout, retry with the same arguments.** The report keeps generating and is cached upstream, so the repeat call usually returns quickly. (Same for `get_campaign_history_report`.)

## CSV output format

All three report tools return CSV with a summary banner stating **Records, the row `Grain`, and pagination**. Two things are specific to `get_dynamic_report_data`:

- **There is no grand `Total` in its metadata.** You cannot know the full row count without paging to the end. State the scope you actually fetched ("first 100 rows by spend") instead of implying completeness. The classic reports *do* carry `Total`.
- **Its `Grain` is whatever you asked for**, not a fixed property of the tool — it's the dimension combination in your `columns`. Read it back before aggregating. (On the classic reports the grain is fixed: `campaign` for the breakdown report, `(campaign_id, change_time, id)` for the history report.)

Both classic reports carry a grand **`Total`** — cite it there instead of paging to a short page.

`get_campaign_breakdown_report`'s banner is **not** the bare legacy line: it carries `Grain` *and* `Total` together, plus two extra lines —

```
Grain: campaign | Records: 2 | Total: 7 | Page: 1 | Size: 2 | More data available - use pagination
Row key: campaign — these columns together uniquely identify each row; …
metrics ctr/cpc/cpm/cpa/cvr/roas are pre-computed per row — do not recompute or average them across rows
```

`get_campaign_history_report`'s banner has the same shape — `Grain`, `Total`, a `Row key:` line (its key is the triple `campaign_id, change_time, id`) and the same `More data available` hint.

So on **both** classic reports: read the **`Row key:`** line before any merge or dedupe, and treat **`More data available`** as the explicit signal that further pages exist.

## Pagination and aggregation

- Keep `page_size` constant across pages of one query.
- **No `Total` means the stop rule changes:** page until a page comes back with fewer than `page_size` rows — that's the last one. Never aggregate a sum/mean/ranking from page 1 alone unless page 1 was short.
- Prefer making the **server** do the aggregation: request exactly the dimensions you want rolled up (e.g. `columns=[WEEK, CLICKS]` for weekly clicks) rather than pulling day-grain rows and summing client-side.
- The full aggregation discipline (sum-reconciliation gate, rate-metric rules) lives in `knowledge/reporting-aggregation.md` — it applies to every aggregated number you quote.

## Known behaviors and traps

*Observed on the 2026-08-20 staging validation (10-question comparison run). Re-verify any that block an answer — some may have been fixed before the production release.*

- **CTR here = clicks / *visible* impressions**, not served ads — **confirmed**, and the cause of the long-standing "the dynamic report's CTR doesn't match" reports. The metamodel labels `VISIBLE_IMPRESSIONS` as `Impressions`, and CTR divides by that. A side-by-side run showed 0.56–0.63% here against 0.40–0.48% from the fixed reports on the same weeks. If a user sees a rate gap while raw counters reconcile, this is the first suspect — explain the basis rather than calling either number wrong.
- **Week buckets start on Sunday**, and the first bucket's label can be a date *before* your requested range (window starting Mon Jun 29 → first bucket labeled Jun 28). For week-grain queries, **snap custom ranges to whole Sunday–Saturday weeks** — a mid-week edge produces partial first/last buckets whose rates look normal but aren't comparable week-over-week. Echo the actual bucket boundaries in your summary and flag any partial bucket.
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

**"Spend by campaign for a GROUP / admin-network account."**
1. `get_campaign_breakdown_report(account_id, start_date, end_date, sort_field="spent", sort_direction="DESC")`.
2. Cite the banner's `Total` for the full campaign count; summarize the top rows in prose.
3. Route on `type` up front where you can. Recovering from a single 403 is legitimate only for an admin network that presented as `NETWORK` — never as a substitute for checking `type`.

**"What changed on this campaign recently?"** → `get_campaign_history_report` (audit log), not the dynamic report.

## Interpretation guidelines

1. **Always translate relative dates.** "Last week" → an explicit preset or ISO range in the call, and echo the resolved range back in your summary.
2. **Cite numbers, not adjectives.** "Top-performing" is meaningless without the spend/CTR figure next to it.
3. **Zero rows** → say "no records for this query" explicitly; don't make up narrative from an empty report.
4. **State fetched scope honestly.** Without a grand `Total`, say what you pulled ("top 50 rows by spend; more may exist") rather than implying the full universe.
5. **Attribution basis is not declared by the report.** No doc yet states which basis (CT / VT / Total) the dynamic report's conversions metric carries — apply the guardrails' assumed-context rule (state the assumption and flag it) on every conversion figure until this is verified against the shipped release.

*(Attribution + timeframe rules for CPA / CVR / Leads / ROAS are enforced globally by `os/guardrails.md` § "Metrics and attribution" — they apply to every report summary you produce.)*

## Gotchas

- **CSV, not JSON.** Report tools differ from campaign/account tools in response format.
- **Settings first, always.** Column and filter names are metamodel-defined per account (custom conversion metrics vary by account) — a name that worked on one account may not exist on another.
- **Large pulls are slow.** Ask before paginating beyond the first 3 pages.
- **Two filter shapes.** The dynamic report takes structured `{name, operator, values}` objects; `get_campaign_breakdown_report` takes a flat key/value object. Passing one shape to the other tool fails.
- **A 403 from the dynamic tools is usually an account-type signal, not an error to report** — switch to `get_campaign_breakdown_report` and answer the question, without retrying or re-authenticating. Stay silent about the 403 **only when that fallback actually succeeds.** If the breakdown report also 403s, this is a genuine access problem (revoked account access, token scope) — say so plainly rather than hiding it.
- **History ≠ performance.** `get_campaign_history_report` answers "what changed", not "how did it perform". Routing a trend question there (or a change question to the dynamic report) is a wrong-tool miss.

See `references/report-fields.md` for the metamodel structure and `references/csv-examples.md` for sample outputs.
