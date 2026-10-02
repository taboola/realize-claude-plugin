# Report Fields Reference

Quick lookup for what the Realize MCP reporting tools return. The dynamic report's field surface is **account-specific and metamodel-defined** — the authoritative list is always the live `get_dynamic_report_settings` response for the account in hand, never this file.

## `get_dynamic_report_settings` — the metamodel

Returns a structured markdown menu of everything the account's `PERFORMANCE` report can express:

- **Dimensions** — fully-qualified names like `PERFORMANCE_REPORT.CAMPAIGN.CAMPAIGN_NAME`. Per the Realize UI's dimension list these cover campaign fields, ad/item fields (incl. Ad CTA), time buckets (Day / Week / Month / Quarter), and targeting dimensions (Country, Region, DMA, Site, Platform, Browser, OS) — but the account's live metamodel is the authoritative list, and the UI's surface may not match the API's exactly.
- **Metrics** — `PERFORMANCE_REPORT.METRICS.*`. Per the Realize UI's metric list: Spent, Clicks, Impressions, CTR, CPM, Actual CPC, Conversions, Conversions Value, Actual CPA, Conversion Rate, ROAS, Served Ads — same caveat: the metamodel is authoritative. Accounts with conversion rules also expose **per-rule conversion metrics**, shown compactly as a naming pattern plus the rule list.
- **Filterable fields** — each with its allowed operators (`EQUALS`, `NOT_EQUALS`, `IN`, `NOT_IN`, `GREATER_THAN`, `LESS_THAN`, `BETWEEN`, `LIKE`).

`name_filter` narrows every section to entries whose name or label contains the substring (case-insensitive) — use it to find one field or to shrink the menu on a rule-heavy account.

**Copy names verbatim.** They are opaque identifiers; do not re-case, abbreviate, or reconstruct them from patterns.

## `get_dynamic_report_data` — what a row is

The row grain is exactly the set of dimension columns you requested; metrics are aggregated to that grain server-side. The CSV banner states **Records, Grain, and pagination** — no grand `Total` (page until a short page to know the full count).

Known field-level traps (staging-observed; re-verify if they block an answer):

- `SITE.NAME` errored with 400 — the working readable column is `SITE.DESCRIPTION`.
- Entity-attribute dimensions (campaign bidding strategy, Ad CTA) have come back unaggregated — repeated dimension values across rows. Check for duplicates before quoting.
- CTR = clicks / **visible** impressions. Raw counters (spend, clicks, impressions, conversions) reconcile exactly with other surfaces; rate definitions may not.

## `get_campaign_history_report` — change/audit log

**Not performance data.** Returns the campaign change log: what was changed, when. One row per change event; the row key is the triple `(campaign_id, change_time, id)`.

- Columns: `id`, `account_id`, `account_name`, `campaign_group_id`, `campaign_group_name`, `campaign_id`, `campaign_name`, `change_type`, `activity_code`, `activity_code_description`, `activity_details_code`, `activity_details_description`, `old_value`, `new_value`, `performer`, `change_time`, `parameters_details`. No impression/click/spend or rate metrics.
- **`change_time` is formatted `MM/DD/YYYY`**, not ISO — don't parse it as `YYYY-MM-DD`, and don't assume a time-of-day component.
- Campaign-level fields can be blank on account-level changes (a creative-description edit, say, carries no `campaign_id`) — so client-side filtering to one campaign silently drops those rows. Say what you filtered.
- No sort, no filters — API default order, and **account-wide**: scoping to one campaign is client-side post-filtering on `campaign_id`.
- `page`/`page_size` (default 20, cap 100). Banner carries `Grain`, a grand `Total`, a `Row key:` line and a `More data available` hint — page further while `Total` exceeds what you hold.

Use it for "what changed on this campaign?", or to line configuration changes up against a metric inflection you found in the dynamic report.

## `get_campaign_breakdown_report` (classic — still live)

One row per campaign; the campaign id column is `campaign`. Not retired, and not a legacy leftover: it is **the only performance report that serves GROUP and admin-network accounts**, which the dynamic report answers with a 403. (`get_campaign_history_report` has no account-type restriction.)

- Params: `account_id`, `start_date`, `end_date` (required); `filters` (**flat** key/value object), `page`, `page_size` (1–100, default 20), `sort_field` (`clicks` | `spent` | `impressions` only), `sort_direction` (`ASC`/`DESC`, default `DESC`; default is no sort).
- Banner carries `Grain`, a grand `Total`, a `Row key:` line and a `More data available` hint. **`Total` is the record count** (campaigns matched), not a spend total — page until you hold `Total` rows, then sum `spent` yourself for any money figure.
- `ctr`, `cpc`, `cpm`, `cpa`, `cvr`, `roas` are server-computed per row — use as-is; sum only `clicks`, `impressions`, `spent`. The banner repeats this warning on every response.
- **Rate columns are already percentages, not 0–1 fractions.** A `ctr` of `0.0202` means **0.0202%**, not 2.02% — multiplying by 100 again overstates by 100×. Same for `vctr` and the `cpa_conversion_rate*` columns. *(Checked against a live account on 2026-10-02: clicks ÷ impressions reproduced the printed `ctr` only on the percent reading. Re-derive from the row's own clicks and impressions if a figure looks surprising.)*
- **`ctr` and `vctr` are separate columns**: `ctr` = clicks ÷ impressions, `vctr` = clicks ÷ *visible* impressions. The dynamic report's single CTR is the visible-impressions one, so a CTR gap between the two reports is normally this definition difference, not bad data.
- The column list is wide beyond the headline metrics (`traffic_allocation_*`, `demand_type`, `campaign_learning_state`, the `roas_*` and `cpa_*` families, `currency`). Identify by name, never by position.
- Never merge or dedupe on a subset of the `Row key:` columns.
- On timeout, retry with identical arguments — the report is cached upstream.

## Retired tools

`get_top_campaign_content_report` and `get_campaign_site_day_breakdown_report` were removed from the live MCP surface — each was a fixed-grain PERFORMANCE cut the dynamic report expresses as dimensions + metrics:

| Retired tool | Dynamic-report equivalent |
|---|---|
| top content | ad/item dimensions + metrics, sort by spend DESC |
| site/day breakdown | site + day dimensions + metrics |

`get_campaign_breakdown_report` is **not** in this table — it survived the migration (see above).
