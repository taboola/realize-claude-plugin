# Dynamic Report — Comparison Test Scenarios

**Status: PARKED — the dynamic report tool is not live on mcp.realize.com yet** (verified 2026-08-20; live reporting is still only the 4 fixed report tools). These questions are prepared in advance so the test is execute-and-diff on release day.

## Purpose

When the Dynamic Report capability ships in the Realize MCP, run each question twice and compare:

- **Run A — current tools only.** Tell Claude at the start of the run: *"Do not use any dynamic/custom report tool. Answer with the existing report and entity tools only."* (Before release, no instruction is needed — the tool doesn't exist.)
- **Run B — dynamic report only.** Tell Claude: *"Answer using only the dynamic report tool. Do not use the fixed report tools (campaign breakdown, site/day breakdown, top content)."*

`get_campaign_history_report` stays available in **both** runs and is out of comparison scope — the dynamic report has no change-history dimension.

## Test setup (do once, before Q1)

1. Pick **one** test account with real activity in July 2026 (spend on most days, 3+ campaigns, mixed bidding strategies, 20+ ads). All 10 questions run against this account. Record its `account_id`.
2. For Q7, pick one campaign on that account and note its ID.
3. All questions use **absolute dates** so both runs pull the identical window. Default window: **July 1–31, 2026**; the weekly questions use **June 29 – August 2, 2026** (five full Mon–Sun weeks).
4. Global metrics only — no account-specific custom conversions. Max 2 targeting dimensions per dynamic report — a **test-protocol constraint for UI parity**, not a tool limit (`columns` is unbounded in the tool contract).

## What to record per question, per run

- Tools Claude actually called (and in what order).
- The final numbers (paste the table Claude returned).
- Row counts, and the `Total` from the CSV summary line where applicable.
- Whether Claude refused / redirected to UI (expected and correct for Q8–Q10 in Run A).

**Match rule:** raw counters (clicks, impressions, spend, conversions) must match exactly; rates (CTR, CPA, CVR, ROAS) and percentages match within rounding (2 decimal places). Any row present in one run and missing in the other is a finding, not a rounding issue.

---

## Part 1 — Comparison questions (both runs must produce an answer)

### Q1 · Baseline: same grain, no transformation
> "Show me spend, clicks, impressions and CTR per campaign for July 1–31, 2026."

- **Run A path:** `get_campaign_breakdown_report` — this IS its native grain.
- **Run B config:** Dimensions: Campaign Name, Campaign ID · Metrics: Spent, Clicks, Impressions, CTR.
- **Expected:** exact match. Any difference here means the two data paths disagree at source — stop and investigate before trusting Q2–Q7.

### Q2 · Join: campaign attribute as a dimension
> "What portion of my spend went to Maximize Conversions campaigns between July 1–31, 2026? Show me spend broken down by bidding strategy."

- **Run A path:** `get_campaign_breakdown_report` (spend per campaign) + `list_campaigns` (bidding strategy per campaign), joined by Claude.
- **Run B config:** Dimension: Campaign Bidding Strategy · Metric: Spent.
- **Expected:** exact spend per strategy; percentage within rounding. Tests whether Claude's two-tool join equals the native dimension. Watch for campaigns whose strategy **changed mid-month** — the join uses today's setting, the dynamic report may attribute historically.

### Q3 · Roll-up: counters, day → week
> "How many clicks did I get each week between June 29 and August 2, 2026?"

- **Run A path:** `get_campaign_site_day_breakdown_report` (all pages), clicks summed per day → per Mon–Sun week by Claude.
- **Run B config:** Dimension: Week · Metric: Clicks.
- **Expected:** exact match — but only if week boundaries agree. If they don't, first check whether "Week" in the dynamic report starts Sunday or Monday, and whether time zones match.

### Q4 · Roll-up: rates, day → week (highest-risk question)
> "What was my CTR per week between June 29 and August 2, 2026?"

- **Run A path:** same data as Q3; Claude must derive weekly CTR from summed clicks ÷ summed impressions. Note: the fixed tools instruct *never recompute rates across rows* — how Claude resolves that tension is itself a result. Record whether it computes, refuses, or uses `Total` lines.
- **Run B config:** Dimension: Week · Metric: CTR.
- **Expected:** this is the most likely place to find a real discrepancy (client-side math vs server-side rate). Differences beyond rounding are the headline finding of the whole test.

### Q5 · Capped data: ad-level top performers
> "Which of my ads had the highest spend between July 1–31, 2026? Give me the top 20 with spend, clicks and CTR."

- **Run A path:** `get_top_campaign_content_report` — fixed-sorted by spend, capped at 1,000 rows server-side.
- **Run B config:** Dimensions: Ad ID, Ad Title · Metrics: Spent, Clicks, CTR · sorted by Spent desc.
- **Expected:** same 20 ads in the same order. Watch for: ties ordered differently, and (on large accounts) the 1,000-row cap changing totals. Note: the fixed tool's grain is (campaign, ad) — the same ad running in two campaigns appears twice; check how the dynamic report treats it when Campaign is not a chosen dimension.

### Q6 · Top-N with client-side aggregation
> "What were my top 10 sites by spend for July 1–31, 2026?"

- **Run A path:** `get_campaign_site_day_breakdown_report` (all pages), spend summed per `site_id` across campaigns and days by Claude — site_id must be the merge key, never site name.
- **Run B config:** Dimensions: Site, Site ID · Metric: Spent.
- **Expected:** same 10 sites, exact amounts. A different list usually means Run A didn't paginate to the end — check the `Total` line vs rows fetched.

### Q7 · Filter: single campaign, daily grain
> "For campaign <CAMPAIGN_ID> only, show me daily spend and clicks for July 1–31, 2026."

- **Run A path:** `get_campaign_site_day_breakdown_report` filtered/selected to that campaign, summed per day across sites by Claude.
- **Run B config:** Filter: Campaign ID = <CAMPAIGN_ID> · Dimension: Day · Metrics: Spent, Clicks.
- **Expected:** exact match, 31 rows (or fewer if no-spend days are omitted — whether the two paths agree on omitting empty days is itself a check).

---

## Part 2 — Dynamic-only questions (Run A must honestly refuse)

For these, the correct Run A behavior **today** is: state it can't produce this breakdown and offer the Realize UI. A fabricated or partial answer in Run A is a **failure**. After release, Run B answers them.

### Q8 · Ad attribute × platform
> "What's my CTR by ad CTA button per platform — desktop, mobile, tablet — for July 1–31, 2026? I want to see if different call-to-action buttons drive different results per device."

- **Run B config:** Dimensions: Ad CTA, Platform (2 — at the cap) · Metrics: CTR, Clicks, Impressions.
- **Why dynamic-only:** no current tool exposes platform or any ad attribute as a reporting dimension, and no tool crosses ad attributes with anything but campaign. (Platform also appears in Q9 — intentional: Q8 tests the ad-attribute cross, Q9 the time cross.)
- *(Amended 2026-08-20: was "per country" — multi-country test accounts are rare, so geo was dropped here and from the account criteria in Test setup.)*

### Q9 · Platform × time
> "How many clicks did I get per platform — desktop, mobile, tablet — per week between June 29 and August 2, 2026?"

- **Run B config:** Dimensions: Platform, Week · Metric: Clicks.
- **Why dynamic-only:** no current tool exposes platform. (Original phrasing was "inventory type" — not a supported dimension; Platform is the closest real one.)

### Q10 · Environment quality
> "Which operating systems drive the best conversion rate on my account for July 1–31, 2026?"

- **Run B config:** Dimension: OS · Metrics: Conversion Rate, Conversions, Clicks.
- **Why dynamic-only:** no current tool exposes OS/browser.

---

## After the test

- Any Q1–Q7 mismatch beyond rounding → file with tool names, both outputs, and the `Total` lines from Run A.
- Q8–Q10 Run A results feed the honesty check (compare with scenario 18/19 expectations in `tests/test-scenarios-read.md`).
- When the tool goes live, sync the plugin per the *stale capability claims* checklist in `CLAUDE.md` — until then the plugin must keep saying these breakdowns need the UI.
