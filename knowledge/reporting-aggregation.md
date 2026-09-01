# Reporting & Aggregation Discipline

> Read this before aggregating any MCP report. The failure mode it guards against: aggregating only the first page of a paginated report and silently understating spend on long-tail breakdowns by 10% or more — numbers look plausible but won't reconcile against the Realize UI.

## Why this file exists

Every Realize MCP report that returns multi-row CSV data is **paginated**. Aggregating the first page only is a silent failure mode: the numbers come back, look plausible, and the answer ships. The mismatch surfaces when the user reconciles against the Realize UI. By then the credibility hit is done.

This file codifies the discipline. Apply it to every report-based answer that quotes an aggregated number — terminal output, summaries, comparisons, anything.

---

## The core rule

**For any aggregated metric (sum / mean / ranking) sourced from an MCP report:**

1. Establish whether you have the full row set. The dynamic report's banner has **no grand `Total`** — you have everything only when a page returns fewer rows than `page_size`. (`get_campaign_history_report` keeps the legacy `Total` field — there, read it.)
2. If more pages may exist, paginate until a short page before aggregating. Never aggregate from page 1 alone unless page 1 was short.
3. After aggregation, run the **sum-reconciliation gate**: sum the per-row `spent` across all rows, compare against `get_campaign.spent` (campaign-scoped) or the summed spend of a fully-paginated campaign-grain dynamic report for the same window (account-scoped — campaign grain is coarse, so it's few rows). If they diverge by more than **2%**, suspect a missing page or a bad date window and re-pull.
4. Only after both checks pass, use the numbers in any answer.

The 2% tolerance covers reasonable rounding across many rows (cents truncation, in-flight UTC-vs-local date-boundary settling). Anything larger means missing data or a bad date window.

---

## Prefer server-side aggregation

The dynamic report aggregates to whatever grain you request. **Ask for the grain you want to talk about** — weekly clicks is `columns=[WEEK, CLICKS]`, not day-grain rows summed client-side. Server-side roll-ups sidestep the pagination risk entirely (fewer rows) and the rate-metric trap below (rates arrive correctly weighted).

Two caveats:

- **Entity-attribute dimensions have returned unaggregated rows** (staging-observed: bidding strategy, Ad CTA — the same dimension pair repeated across hundreds of rows). If the row count is implausibly large for the requested grain, check for repeated dimension values; if present, fetch all pages and roll up client-side using the rules below.
- **Week buckets start Sunday**, and the first bucket's label can precede the requested range. Echo real bucket boundaries.

---

## Rate metrics: sum counters, re-derive rates

- **Sum columns:** `impressions`, `clicks`, `spent`, `conversions`, `conversions_value`.
- **Never sum or average rate columns** (`ctr`, `cpc`, `cvr`, `cpa`, `roas`). `mean(ctr)` across rows is wrong — rows have different denominators.
- After any client-side slice or roll-up, **re-derive weighted**: `CTR = Σclicks / Σimpressions`, `CPC = Σspent / Σclicks`, `CVR = Σconversions / Σclicks`.
- **The dynamic report's CTR = clicks / *visible* impressions** — a different definition from some other Taboola surfaces. Raw counters reconcile exactly across surfaces; rates may not. When a user compares rates against the UI or an old export and sees a gap, name the definition difference instead of calling either number wrong.

---

## Per-tool guidance

### `get_dynamic_report_data`

- Row grain = the dimension columns requested; the banner's `Grain` line states it. Read it back before aggregating — summing across the wrong grain double-counts.
- `page_size` max 100; keep it constant across pages of one query. Stop when a page returns fewer than `page_size` rows.
- Fine grains (site × day, ad × country) on active accounts easily run to thousands of rows — this is the highest pagination risk. Prefer a coarser server-side grain, or filter to one campaign, before resorting to a full multi-page pull.
- For "top N by X" you don't need the universe: sort DESC on X with `page_size=N` and present it as "top N", not as everything.

### `get_campaign_history_report`

- Change/audit log, not performance data — nothing here sums. Legacy banner with `Total`; verify it before claiming you saw every change.

### Discovery tools (`search_accounts`, `search_audiences`, `search_publishers`, `search_contextual_segments`, etc.)

- Pagination matters less because the typical question is "find the one matching this name". But when enumerating a universe (e.g. "every contextual segment for US"), paginate by the same rules — these tools do return `Total`.

---

## The sum-reconciliation gate (mandatory)

After paginating and aggregating, before quoting any per-site or per-day number to the user:

```
sum_rows_spent  = sum of `spent` across every fetched row
expected_spent  = get_campaign.spent (campaign-scoped), or the summed
                  spend of a fully-paginated campaign-grain dynamic
                  report for the same window
diff_pct        = |sum_rows_spent - expected_spent| / expected_spent

if diff_pct > 2%:
    Do NOT ship the aggregated number.
    Re-paginate, widen the date window by 1 day, or check whether
    the filter actually narrowed the result.
```

Common causes of failure:
- Missing pages (the page-1-only failure mode — now harder to detect because there is no `Total` to check against; the short-page stop rule is the only guard).
- Date-window boundary mismatch between the report and `get_campaign.spent` (time-zone settling). Adjust the range by 1 day if the gap is small and consistent.
- A filter that didn't narrow: verify returned rows actually carry the filtered value.
- An item that ran during the period was deleted before the report was pulled.

---

## What this rule prevents

| Failure mode | Example | What this rule does |
|---|---|---|
| Page-1-only aggregation | Aggregated 97 of 2,433 rows; top-site spend reported as €231.61 vs. actual €256.06, ~10% understated. | Forces full pagination via the short-page stop rule. |
| Silent partial-data ship | No error or warning surfaced — the numbers looked plausible. | Sum-reconciliation gate against `get_campaign.spent` catches the gap before ship. |
| Ranking shifts | Relative CTR ranking was directionally correct, but absolute spend / CTR per site was wrong; a different campaign could see ranking flip entirely. | Full data (or an honest server-side "top N by X") keeps rankings stable. |
| Reconciliation mismatch with the Realize UI | The user reconciles against the UI and finds the mismatch. Credibility cost. | Counters match the UI within 2%; rate-definition gaps are named, not shipped as errors. |

---

## Application checklist (silent, before answering any report-based question)

- [ ] Pulled the metamodel (`get_dynamic_report_settings`) and requested the coarsest grain that answers the question.
- [ ] Read the banner's `Grain` line; it matches the intended roll-up.
- [ ] Paginated until a short page (or bounded the claim to "top N" with a DESC sort).
- [ ] Summed counter columns only; re-derived rates weighted.
- [ ] Ran the sum-reconciliation gate. Within 2%.
- [ ] Documented the row count and scope in the summary (e.g. *"aggregated across 2,433 site-day rows; reconciled against €7,499.89 total spend (within 0.4%)"*).

If any check fails, fix and re-run. Never ship aggregated numbers from a partial sample.
