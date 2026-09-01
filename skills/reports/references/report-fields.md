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

**Not performance data.** Returns the campaign change log: what was changed, when. No sort, no filters — API default order, and **account-wide**: scoping to one campaign is client-side post-filtering on a campaign-identifier column. Takes the legacy `page`/`page_size` pair (default 20, cap 100) and keeps the legacy banner with a grand `Total` — cite it, and page further if `Total > Size`. Use it for "what changed on this campaign?", or to line configuration changes up against a metric inflection you found in the dynamic report.

Exact columns — including the campaign-identifier column the client-side filter depends on — should be verified against real output before quoting field names to a user.

## Retired tools

`get_top_campaign_content_report`, `get_campaign_breakdown_report`, and `get_campaign_site_day_breakdown_report` were removed from the live MCP surface — each was a fixed-grain PERFORMANCE cut the dynamic report expresses as dimensions + metrics:

| Retired tool | Dynamic-report equivalent |
|---|---|
| top content | ad/item dimensions + metrics, sort by spend DESC |
| campaign breakdown | campaign dimensions + metrics |
| site/day breakdown | site + day dimensions + metrics |
