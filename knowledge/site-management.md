# Site Management

## Overview

Site management controls which publisher sites receive campaign spend. Effective management balances performance optimisation (excluding sites that underperform on the campaign's KPI) against reach (maintaining enough inventory). This file covers site targeting, performance monitoring, blocking decisions, approved lists, the historical-publisher block guard, and cross-cutting CPA / CVR issues.

---

## Site Performance Monitoring

### How to Monitor

Periodically review the **site performance report** in the "Site" section of the Realize UI.

### Sites to Consider Excluding

Consider excluding sites that:

- Generate **fewer clicks against spend**.
- Have **clicks but little or no conversions** against spend.
- Have **significantly higher CPAs** than campaign averages.

### Data Thresholds for Site Decisions

Only take exclusion decisions when sufficient data exists.

1. **Campaign level:** Campaign Clicks ≥ 500 and Campaign Conversions ≥ 5 (ensures campaign CVR is relatively stable).
2. **Site level:** either of the following:
   - Site Clicks ≥ 100, or
   - Site Clicks ≥ 2 ÷ Campaign_average_CVR (the number of clicks that would have generated 2 conversions under the campaign's average CVR).

---

## Historical Top-N Publisher Block Guard (mandatory before any block)

Some publishers are structurally important to delivery — blocking them mid-flight without confirmation can cap the campaign's volume ceiling. Before recommending or accepting an `EXCLUDE` (publisher block), verify whether the publisher was a **top-N source in either of the previous 2 comparable periods**. `N` defaults to 5.

### When the guard fires

The guard fires when **both** are true:

1. The recommendation is to `EXCLUDE` (block) a publisher, or an audit shows an `EXCLUDE` was applied during the analyzed day.
2. That publisher ranked in the top-N by spend in either of the previous 2 comparable periods (last 14 days for daily campaigns; last 2 weeks / 2 months for weekly / monthly cadences).

### Mandatory effects

- **Surface a `[TOP-N HISTORICAL]` flag** prominently in the output (badge or column).
- **No EXCLUDE recommendation may ship without explicit user confirmation.** The action verb is "Confirm proceed" — never imperative "Block."
- **For audits of past blocks**: flag the row, quantify the spend cost during the block window, recommend re-include before the next period unless the user has documented business justification.
- **In post-mortems**: every historical-top-N block must appear in the manual block audit with the historical-rank flag and the revert status.

### Why the guard exists

Top-N historical publishers are usually structurally important because:

- They've been algorithmically validated as supply sources for the account / vertical.
- Removing them shifts spend to lower-confidence supply.
- Re-onboarding them after a block costs algorithm learning time.
- Blocks made in panic (e.g., mid-flight on a CAC spike) often turn out to be wrong calls in hindsight.

### When the guard does NOT fire

- Publisher had spend = $0 in the lookback window (no historical contribution to protect).
- Action is INCLUDE / WHITELIST_ADD — guard is about EXCLUDEs only.
- Publisher has been blocked at the network or syndicator level by Realize Operations for safety / brand reasons (policy decision, not optimisation).
- Account is in active onboarding / first 30 days — no meaningful "historical" exists yet.

---

## Approved Lists (Whitelists)

### What approved-list mode does

When a campaign uses approved-list mode, only the publishers on the list are eligible to serve. The algorithm has a much smaller supply pool to optimise against, which **amplifies** the impact of any further block — removing one publisher from a list of 20 is a much bigger cut than removing one from open targeting.

### Approved-list dynamics

- **Constrained inventory limits optimisation room.** Less supply means fewer opportunities for the algorithm to find efficiency.
- **Blocking inside a whitelist is amplified.** A small block in a whitelist can change the whole shape of delivery.
- **On Maximize Conversions**, a shrinking whitelist pool can cause CPC spikes without any bid or budget change — the algorithm bids harder on remaining supply to hit the daily cap.

### When to recommend approved-list mode

- You have **significant learnings** from past or always-on campaigns and a confident list of top performers.
- **Short-burst / seasonal campaigns** where running on known winners maximises impact in the available time.
- **Curated premium publishers** you want to associate with (e.g., Yahoo placements only).

### Phrasing in answers

> "This campaign runs on an approved list — blocking a publisher here has bigger impact than in open targeting."

---

## Scaling: Site Targeting

### Scaling via Site Exclusions

| Lever | When | Guidance | Monitor |
|---|---|---|---|
| **Excluding sites** | Spend going to sites not contributing conversions or with high CPC / CPA | Monitor site performance, exclude **10-20 underperforming sites**. **Always check the historical-top-N guard before applying.** | CVR. Continue monitoring post-exclusion. |

---

## Concentrated Site Spend

### When Spend Is Focused on a Few Sites

If campaign spend is concentrated on a few sites, limiting algorithmic learning and opportunities to scale:

| Action | How |
|---|---|
| **Create a campaign excluding those sites** | Allows the algorithm to redistribute budget toward under-utilised sites and uncover new performance pockets. |
| **Adjust budget settings** | If budget is too narrow or capped, the algorithm may continue favouring a handful of placements. Increasing or redistributing budget opens opportunities for exploration. |
| **Cross-check with auction insights** | Review auction data — check whether delivery is constrained by low bid competitiveness or site-level restrictions. Check auction activity for specific publisher sites. |

---

## Why a Publisher Isn't Serving — Block Attribution

When a publisher with healthy historical performance suddenly stops serving on a campaign, it is rarely a single cause. There are three families of reasons, and the answer drives different fixes:

| Block family | What it means | Typical fix |
|---|---|---|
| **SpendGuard / Custom Rule block** | An automated rule excluded the publisher based on its CPA / CVR / spend pattern. | Review the rule's threshold; consider relaxing if the publisher is top-N historical. |
| **Targeting eligibility loss** | Campaign's targeting changed (geo, OS, language, audience) and the publisher no longer matches. | Restore the lost targeting or duplicate the campaign with a broader match. |
| **Bid loss** | Campaign is winning fewer auctions on this publisher. Common on Fixed Bid / Enhanced CPC when bid hasn't kept pace; also on Maximize Conversions when budget shrank or learning reset. | Check auction insights, review bid competitiveness, verify the campaign isn't in a fresh learning phase. |

When recommending a fix, name the block family explicitly. "Publisher X stopped serving — and the change log shows a SpendGuard cap fired on Apr 18" is a much more useful answer than "Publisher X stopped serving."

---

## Cross-Cutting: Sites + CPA / CVR Issues

### When Both CPA and CVR Are Underperforming

| Step | Action |
|---|---|
| 1 | **Cross-check with auction insights.** Identify campaign blockers using the auction report — check whether the campaign is competitive enough or facing blockers needing corrective action. |
| 2 | **Budget adjustments.** Ensure CPA goals are realistic. Consider increasing budget to allow the algorithm to explore more conversion opportunities. |
| 3 | **Check site report.** Identify underperforming sites to manually block, or set up Custom Rules to automate and avoid wasted spend. **Run the historical-top-N guard before blocking.** |
| 4 | **Review and refresh messaging.** Check creative performance, pause underperforming ads. Double down on what works by using Gen AI AdMaker to create variations of top performers. |

### CPA / ROAS High-Level Framework

When the account's average CPA is higher than the goal:

1. **Remember the average consists of outlier segments.** A segment can be a campaign, an ad, a site, a platform / OS, or even hours of the day. Identify the worst segments driving CPA up and consider excluding them.
2. **Don't be hasty with optimisations.** Only optimise when there is enough data. Use longer lookback windows. There is no magic number for sufficient data.
3. **Leverage tools for site optimisations.** SpendGuard (fully automated), Custom Rules (semi-automated), or conditional filters (manual) to identify outliers.
4. **Tap into additional supply or users** — Mail, predictive audiences, retargeting campaigns.
5. **Refresh creatives** — especially for narrow-targeted campaigns which suffer more from fatigue. Refresh must be significant (new angles, not a word change).
6. **Is there enough data?** Consider adding a secondary event if only optimising for primary and conversion volume is low.
7. **Scale top performers.** If you identify campaigns at or below CPA goal, scale them gradually. More conversions at good CPA = overall CPA decreases.

---

## Display Campaign Site Management

Special rules for display campaigns:

- **Do not block channel publishers** — these indicate sites with header-bidding supply.
- **Do not block publishers based on Sponsored Content campaign performance** or past experiences — Sponsored Content and Display have different dynamics.

---

## Guardrails

- Never exclude sites without meeting data thresholds (Campaign: 500 clicks + 5 conversions; Site: 100 clicks or 2 / CVR).
- Never block publishers while the campaign is still learning — read `cvr_learning_status`, don't assume from age. Typically ~7-10 days, but a low-volume campaign can report `CVR_LEARNING` for months.
- **An empty status does not mean "not learning".** `skills/optimize-campaign/SKILL.md` P5 Step 1 is the authoritative list of when it is genuinely not applicable — read it there rather than from a copy, which is how this rule has drifted before. In every other case an empty status means still learning, so publisher blocking stays off-limits. Only in the genuinely not-applicable cases fall back to the volume floor: nothing under ~500 campaign clicks or in the first ~7-10 days.
- Never block channel publishers in display campaigns (header-bidding supply).
- Never block display publishers based on Sponsored Content performance.
- Never block a top-N historical publisher mid-flight without explicit user confirmation — phrase as "Confirm proceed," not imperative.
- Never be hasty with optimisations — require sufficient data over longer lookback windows.
- Always run the historical-top-N guard before recommending or accepting any EXCLUDE.
- Always explain the **block family** (rule / targeting / bid loss) when a publisher stops serving — not just "it's blocked."
- Always check auction insights when diagnosing site performance issues.
- Always review site performance periodically in the Realize UI.
- Always consider creating an excluding campaign (vs. blocking sites) to test redistribution.

## Common Mistakes

1. **Blocking during learning phase.** Removes publisher exploration. Wait until `cvr_learning_status` reads `CVR_LEARNING_COMPLETE` — not a fixed number of days.
2. **Insufficient data for blocking.** Blocks potentially good sites. Follow data thresholds.
3. **Blocking display publishers based on Sponsored Content data.** Different dynamics. Evaluate each campaign type independently.
4. **Blocking channel publishers.** Removes header-bidding supply. Never block these in display.
5. **Only blocking, never redistributing.** Doesn't find new pockets. Try the excluding-campaign approach.
6. **Not using auction insights.** Missing context on bid competitiveness and blockers. Always check auction insights.
7. **Blocking a top-N historical publisher without confirmation.** Caps the volume ceiling. Run the guard first.
8. **Treating a "publisher not serving" report as one cause.** Three block families exist (rule / targeting / bid). Name the right one.

## Pro Tips

- Instead of just blocking underperforming sites, try creating a **parallel campaign excluding those sites**. This lets the algorithm find new performance pockets while keeping the original campaign running.
- **Auction insights** are underused. They tell you whether delivery is constrained by bid competitiveness or site restrictions — critical context before taking action.
- Exclude **10-20 underperforming sites** at a time, not 50+. Aggressive blocking limits the algorithm's ability to find conversions.
- Continue monitoring site performance **after** exclusions — the remaining sites' dynamics change once top spenders are removed.
- For concentrated-spend issues, increasing budget can sometimes be more effective than blocking — it gives the algorithm room to explore beyond the current top sites.
