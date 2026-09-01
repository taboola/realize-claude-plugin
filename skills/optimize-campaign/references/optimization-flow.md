# Optimization Flow — Reference Depth

> Loaded by `skills/optimize-campaign/SKILL.md` when a branch needs operational depth that the front-door SKILL.md intentionally doesn't carry. Read the SKILL.md first for pre-checks (P1-P5), the RCA 6-signal framework, the 7-point optimization framework, and the action-output discipline.
>
> **Authoritative knowledge anchor:** the Realize topic files in `knowledge/`. Where this depth file sharpens guidance into operational rules, those rules never override the topic files on a substantive call.

---

## 1. Dimensional drill-down + data-sufficiency gates

Shared by both the RCA and Optimization paths. Identifying outlier segments and verifying they're judgeable.

### Dimensions

Pull each dimension and rank by spend contribution:

All performance dimensions come from the dynamic report (`get_dynamic_report_settings` first, then `get_dynamic_report_data` at the stated grain — see the `reports` skill for the workflow):

| Dimension | Dynamic-report grain | What to look for |
|---|---|---|
| Campaign | campaign dimensions + metrics | Which campaigns are above goal CPA? Which are below? |
| Ad / Item | ad/item dimensions + metrics, sort by spend DESC | Which ads carry the spend? Outlier CTR / CVR? |
| Site / Publisher | site dimension (readable name via the site description column), filtered to the campaign | Top spenders with no conversions? Sites with CPA > 2× campaign average? |
| Platform | platform dimension | Desktop vs Mobile vs Tablet — any one platform dragging? |
| OS | OS dimension | If platform-level looks fine, drill into OS (Android vs iOS often diverge sharply). |
| Daypart | Realize UI (out of MCP scope today) | Surface as a UI navigation path. |

**Aggregation discipline:** Always paginate the full result set (see `knowledge/reporting-aggregation.md` for the short-page stop rule + sum-reconciliation gate). Page-1-only aggregations silently understate spend on long-tail breakdowns.

### Data-sufficiency gates — verify before recommending action

A statistical-volume floor on the dimension item, plus a specific threshold for site-block recommendations.

> **Currency note (low-spend exclusion):** thresholds expressed in dollars (e.g. "spend < $5") are **USD-equivalent** — convert the entity's local-currency spend to USD before applying the floor.

**Statistical volume tiers:**

| Tier | Conversion threshold | Click threshold | Use for |
|---|---|---|---|
| **High Confidence** | 100+ conversions | 1,000+ clicks | Strategic decisions, budget shifts, definitive recommendations |
| **Standard** | 50+ conversions | 500+ clicks | Recommendations with caveats |
| **Minimum** | 20+ conversions | 100+ clicks | Directional signals only — flag as low confidence |
| **Insufficient** | < 20 conversions | < 100 clicks | Exclude from analysis — do not recommend actions |

**Daily-spend floor:** daily budget ≥ **8× the CPA goal** (realize-toolkit operational guidance, Apr 2026). Below that the campaign cannot generate enough daily conversion signal to judge performance or feed the algorithm — the first prescription is raising the daily budget (or resetting the CPA expectation), not tuning other levers.

### Site-blocking threshold

For "block this site" recommendations specifically, the operative threshold from `knowledge/site-management.md`:
- Campaign-level clicks ≥ 500, AND
- Campaign-level conversions ≥ 5, AND
- Either site clicks ≥ 100 OR `2 / campaign_avg_CVR` clicks on the site.

A site-block recommendation needs this threshold to pass — AND the historical-top-N publisher block guard (see `knowledge/site-management.md`).

### What this means in practice

If a dimension item falls into the Insufficient tier, or a site-block candidate fails the site-block threshold above, do NOT block / pause / reduce — instead, recommend "wait for more data" with a concrete re-check date.

---

## 2. Supply-side eligibility check

Shared by both paths. Verify the campaign is reaching the supply it expects to. Three checks.

### 2.1 Auction insights

Is the campaign winning the auctions it enters, or losing on bid?

**Source: Realize UI only — no MCP tool exposes auction data.** Ask the user to open Auction Insights in the UI and read you the loss %; never estimate or fabricate it. If the user can't supply it, skip this check and say so explicitly rather than guessing.

| Bid Strategy | Loss interpretation | Action |
|---|---|---|
| Maximize Conversions / Target CPA / Maximize Value | Structural levers only — the algorithm sets the bid | Increase budget if CPA is good; widen targeting; check learning state |
| Enhanced CPC / Fixed Bid | Bid-too-low signal | Raise bid or publisher bid modifier |

**Auction loss thresholds:**

| Auction Loss % | Interpretation | Action |
|---|---|---|
| > 99% | Hard blocker | Maximize Conversions / Target CPA / Maximize Value: increase budget. Enhanced CPC: raise CPC. |
| 50-99% | **NORMAL — do not mention to the user.** | None. |
| < 50% | Targeting may be too narrow | Widen one dimension at a time. |

50-99% auction loss is normal for any active campaign — over-interpreting it is a common credibility failure.

### 2.2 Site / publisher blockers

Re-read the campaign's site exclusions (`get_campaign`), plus SpendGuard state, custom-rule history, and brand-safety filters — those three are **UI-visible only**; ask the user rather than guessing. A publisher that's been blocked or paused will look identical to a supply shift if not checked. Use the block-attribution framework in `knowledge/site-management.md` (rule fired / targeting eligibility loss / bid loss).

### 2.3 Targeting restrictions — narrow-targeting diagnostic

If reach is small, route to the **6-dimension narrow-targeting diagnostic** in `knowledge/targeting.md`. Priority order: geo → audience → publisher → bidding → language / quality → platform / OS. Identify the dominant constraint and pair with a concrete broadening recommendation.

### Supply concentration risk

When pulling site breakdowns, also check concentration:

| Top site % of spend | Risk |
|---|---|
| > 40% | High — single point of failure |
| 20-40% | Moderate — monitor |
| < 20% | Healthy — diversified |

A high concentration with poor performance is a major lever (add diversification). A high concentration with great performance is OK but flag as a risk for future planning.

---

## 3. Creative fatigue check

Shared by both paths. Detecting fatigue and triggering refresh decisions. Anchors on `knowledge/creative.md`.

### Fatigue tier classification (first match wins, top-down)

> These fatigue tiers (1 / 2 / 3) are a creative-decay severity scale and are unrelated to the "Tier 1 audience regions" concept in `knowledge/targeting.md`. Read in context.

| Condition | Tier | Action |
|---|---|---|
| CTR declined 30%+ from peak OR (CTR declined 20%+ AND active 7+ days) OR CPA doubled week-over-week | **Tier 3 — Action Required** | Rotate immediately |
| CTR declined 20%+ from peak OR (CTR declined 10%+ AND active 5+ days) OR CPA increased 30%+ week-over-week | **Tier 2 — Warning** | Prepare replacements |
| CTR declined 10%+ from peak OR CPA increased 15%+ week-over-week | **Tier 1 — Monitor** | Watch closely |
| None of the above | **Healthy** | No action |
| No CTR history | **Insufficient Data** | Do not classify |

### Industry creative lifespan benchmarks

| Vertical | Typical lifespan | Rotation trigger |
|---|---|---|
| E-commerce (Fashion) | 7-14 days | CTR decline > 15% |
| E-commerce (Electronics) | 14-21 days | CTR decline > 20% |
| Insurance / Finance | 21-45 days | CTR decline > 20% |
| B2B / SaaS | 30-60 days | CTR decline > 25% |
| Travel | 7-14 days | CTR decline > 15% |
| Gaming / Apps | 5-10 days | CTR decline > 10% |
| Health / Wellness | 14-30 days | CTR decline > 20% |

### Wilson-score ranking for creative comparisons

When ranking creatives by CVR, **raw CVR is misleading at small sample sizes.** Use the Wilson score 95% confidence interval lower bound for conservative ranking.

Example: Ad A (5000 clicks, 150 conv, raw CVR 3.0%, Wilson lower 2.56%) vs Ad C (50 clicks, 3 conv, raw CVR 6.0%, Wilson lower 2.07%). Ad C has the higher raw CVR but Ad A's lower bound is higher — Ad A is the safer bet for scaling.

### Refresh discipline

A refresh is a **new angle**, not a word change. "Significant refresh" means new visuals, new messaging frame, or new format (static → motion → carousel). If the proposed refresh is a copy edit, reject and ask for a creative variant.

---

## 4. Lag-effect table — for change-cause attribution

When walking RCA signal 1 (config change) or evaluating any action's expected impact, use these lag windows:

| Change Type | Expected Lag |
|---|---|
| Budget decrease | 0-1 days |
| Budget increase | 1-3 days |
| Bid strategy change | 3-7 days |
| Site blocks (1-3 sites) | 1-2 days |
| Site blocks (5+ sites) | 3-5 days |
| Targeting narrowed | 1-2 days |
| Targeting expanded | 2-4 days |
| Ads paused | 0-1 days |
| New ads added | 3-5 days |

**Root-cause heuristic:** Change date + lag = expected impact date. If the impact date matches the observed KPI change date, the change is the likely cause.

---

## 5. Signal interpretation tables

### CPA vs goal

| CPA / Goal | Signal | Action |
|---|---|---|
| < 0.7× | Excellent | Budget increase, expansion |
| 0.7× – 1.0× | Good | Monitor, no urgent changes |
| 1.0× – 1.3× | Acceptable | Review sites / ads for quick wins |
| 1.3× – 2.0× | Concerning | Full audit, block underperformers |
| > 2.0× | Critical | Deep investigation, structural changes |

ROAS inverts: > 1.3× Excellent, 1.0×-1.3× Good, 0.75×-1.0× Concerning, < 0.75× Critical.

### CTR benchmarks

| Platform | Target CTR | Problem Threshold |
|---|---|---|
| Mobile | ~1.0% | Below 0.5% |
| Desktop | ~0.5% | Below 0.3% |
| Display | ~0.05% | Below 0.02% |

(Varies by vertical — benchmark before drawing conclusions.)

### CTR × CVR matrix

| CTR | CVR | Insight | Action |
|---|---|---|---|
| High | High | Winner | Scale, duplicate |
| High | Low | Clickbait | Wrong audience, misleading creative |
| Low | High | Hidden gem | Improve creative, keep targeting |
| Low | Low | Underperformer | Full review |

### Conversion volume

| Weekly Conv | Signal | Action |
|---|---|---|
| 50+ | Healthy | Normal optimisation |
| 30-50 | Adequate | Monitor, consider softer events |
| < 30 | Low | Check if softer / upper-funnel events can be added |

Before recommending softer events, check whether they're already in "Total Conversions" — if yes, don't double up.

---

## 6. Bid-lever matrix — quick reference

The canonical bid-lever matrix lives in `knowledge/bidding.md` ("Bid Levers — What's Possible at Each Level"). Read it for the per-strategy validity of every action. Short summary:

| Bid Strategy | Optimises for | Valid action set |
|---|---|---|
| Maximize Conversions | Conversion volume | Structural levers only: site blocks, ad pause / refresh, budget changes, targeting changes, CPC cap (last-resort). Algorithm sets the bid. |
| Maximize Value | Conversion value | Same structural levers as Maximize Conversions. ROAS target (`roasGoal`) is UI-only on DCO accounts — **not exposed via MCP**, so the optimize-campaign workflow cannot adjust it directly. |
| Target CPA | Conversions at target cost | Same as Maximize Conversions, plus Target CPA adjustment (last-resort lever — see hard rules below). |
| Enhanced CPC | Conversions with CPC control | Full set: CPC bid changes, per-publisher bid boost / de-boost, structural levers. |
| Fixed Bid (incl. VCPM Display) | Impressions at manual cost | Full set: bid changes, structural levers. |

**Hard rules:**

- **Per-item (per-creative / per-ad) bidding does NOT exist on any bid strategy.** If a user asks to "bid more on this ad," reframe as scale (more budget at the campaign level), pause-and-replace (kill the loser, multiply the winner), or duplicate-and-isolate.
- **Per-publisher bid moves are valid only on Enhanced CPC / Fixed Bid.** On Maximize Conversions / Target CPA / Maximize Value the only publisher-level levers are block / unblock / whitelist.
- **CPC bid changes are valid only on Enhanced CPC / Fixed Bid.** On the fully-automated strategies (Maximize Conversions / Target CPA / Maximize Value) the algorithm sets the bid — recommending a CPC change there is invalid.
- **CPC cap is valid only on Maximize Conversions** as a last-resort lever — setting it on Enhanced CPC / Fixed Bid / Target CPA / Maximize Value returns API 400. On Maximize Conversions, apply only if CPA efficiency is critical AND scale is strong (see `knowledge/bidding.md` "Bid Ceiling for Maximize Conversions").
- **Target CPA is a last-resort lever, not a routine adjustment.** Wait at least 3-4 days post-launch for a stable CPA baseline. Never set Target CPA at launch. Set within 10-20% of stable actual CPA; aspirational targets kill delivery.
- **Never recommend switching TO Fixed Bid as a "fix"** for a fully-automated campaign that's working — it disables algorithmic optimisation. Recommend Maximize Conversions instead.

---

## 7. Symptom branches

After the 7-point optimisation walk in the SKILL.md, the symptom usually maps to one of these.

### 7.1 CPA fluctuating (not a single drop)

Route by bidding strategy.

| Strategy | Primary checks |
|---|---|
| Maximize Conversions | Frequent budget changes? (Max 20% per change / no more than every 2-3 days.) SpendGuard disabled? Custom Rules misaligned with real KPIs? Run dimensional drill-down for ad-level post-click underperformance. |
| Enhanced CPC / Fixed Bid | Bid too restrictive? Run supply-side check and review auction insights for bid competitiveness. |
| All strategies | Audience too restrictive? External factors (seasonality, market trends, competitive activity)? |

### 7.2 Low CVR (CPA acceptable)

In order:

1. Confirm tracking via Pre-check P1.
2. If clicks are sufficient (≥ Standard tier from Section 1), run creative-fatigue check. Most-common cause is misaligned ad / landing-page messaging.
3. If clicks are insufficient, the symptom is audience misalignment — run supply-side / targeting check.

### 7.3 Underspending / not delivering

Two scenarios:

| Scenario | Action |
|---|---|
| Performance acceptable + overspending | Allow 2-3 days for the algorithm to stabilise. Avoid mid-learning-phase budget cuts — reducing budget too early resets the learning phase. Only intervene if there are strict budget restrictions; prefer a moderate adjustment over a significant cut. |
| Under-performing + under-spending | Walk delivery-constraint checks: (a) tracking healthy, (b) creatives approved, (c) audience not too narrow, (d) bid sufficient (Enhanced CPC / Fixed Bid), (e) learning phase still in progress, (f) for Maximize Conversions, consider increasing daily spend by up to 20%. |

For Display campaigns specifically: confirm IAB sizes are uploaded (300×250 / 300×600 minimum); confirm no channel-publisher blocks stripping header-bidding supply; recommend Maximize Conversions as the bidding strategy.

### 7.4 Lead quality

First check: are campaign performance metrics also poor?

| If performance is… | Action |
|---|---|
| **Subpar** (low CTR, low CVR) | Fix performance first — lead quality usually follows. Refine creative + messaging; align landing page; include relevant marketplace / contextual segments. |
| **Acceptable** (good CTR, good CVR) but leads are bad | Three checks: (1) audience precision — broad / misaligned audiences deliver volume but low quality; (2) feed CRM / offline conversion data back to the algorithm so it learns "qualified leads" not just "submitted leads"; (3) review creative messaging to set correct expectations. |

### 7.5 Plateau

#### Concentrated site spend
1. Set up a campaign excluding the dominant sites — let the algorithm redistribute and find new pockets.
2. Increase / redistribute budget so the algorithm has room to explore.
3. Cross-check auction insights for publisher-specific blockers.

#### Stagnation / decline (always-on campaigns)
Walk in order:
1. Account for external factors (seasonality, market trends) — adjust budgets accordingly.
2. Check auction insights for blockers (Section 2).
3. Expand audience (predictive, lookalike, contextual, interest, marketplace segments).
4. Refresh ad messaging + creatives significantly (Section 3 tier criteria + new angles).
5. If steps 1-4 fail, set up a fresh campaign — resets the learning phase and removes historical constraints. Pair with fresh creatives, new segments, re-evaluated bidding.

### 7.6 Combined (CPA + CVR both underperforming)

Walk in order:

1. **Auction insights** — supply-side check (Section 2).
2. **Budget realism** — is the CPA goal even achievable for this vertical? Consider increasing budget to allow exploration.
3. **Site report** — dimensional drill-down on sites + custom-rule automation (run the historical-top-N guard before any EXCLUDE).
4. **Creative refresh** — fatigue check (Section 3) + Gen AI AdMaker variations on winners.

---

## 8. Metric hierarchy — within-account vs cross-account

A common credibility failure is comparing CPAs across advertisers without normalising for product value. A $500 CPA is healthy for a luxury vehicle and catastrophic for a low-ticket consumer good.

| Analysis scope | Lead metric | Secondary metric |
|---|---|---|
| **Within a single account** (same advertiser, same product) | **CPA** (primary KPI) | CVR (diagnostic) |
| **Across accounts** — vertical benchmarks, "how does X do in Finance vertical?", cross-advertiser comparisons | **CVR** | CPA (mention but do not lead with it) |

Within-account, the "never explain CPA by CVR" rule applies — don't just say "CPA went up because CVR dropped." Identify the actual root cause (creative change, supply shift, tracking issue, etc.).

---

## 9. Common-mistake patterns

Catch yourself before recommending these. The right reaction is almost always the second column.

| You see | Wrong reaction | Right reaction |
|---|---|---|
| High CPC on Maximize Conversions | "Lower CPC" | Check why the algo bids high — supply mix? Blockers? The algorithm sets the bid; don't try to override it. |
| 78% auction loss | "High competition" | **Normal — don't mention.** 50-99% loss is normal. |
| Low CTR | "Bad creatives" | Investigate: fatigue tier? Targeting? Specific sites? Don't conclude "bad creatives" without comparing against vertical benchmarks. |
| Budget depleted on Maximize Conversions | "Problem" | Normal for Maximize Conversions — only increase if CPA is good. |
| Large blocklist | "Reduce it" | Blocklist size isn't inherently bad. Block decisions are individual, not aggregate. |
| Listing 5 possible causes | "Hedging is safe" | Rank them. Give the strongest one. The user wants a single story. |
| "Investigate Custom Rules" | Recommendation | Ask the user directly — they're the ones who can read their rule config. |
| Recommending budget cut for high CPA | "Save money" | Reduces delivery; doesn't fix inefficiency. Almost always wrong **as an optimisation lever**. Note: budget corrections for stated user errors (e.g., "I set my daily budget to $10,000 by mistake, it should be $100") ARE fine — that's a setup correction, not an optimisation. |

### Advertiser-side patterns to recognise and correct

When the user describes one of these behaviours, name it and correct gently. Don't lecture — give the one-line "what to do instead." These are the most common self-inflicted CPA problems for advertisers new to performance advertising.

| User says / did | What's actually happening | What to do instead |
|---|---|---|
| "I paused and relaunched this campaign 3 times this week" | Each relaunch restarts the learning phase from zero. The algorithm never gets to a stable state. | Pick one configuration. Let it run 7+ days AND 30+ conversions before judging it. Patience outperforms restarts. |
| "I'm changing the budget every day to chase performance" | Daily budget changes are the #1 self-inflicted CPA problem. The algorithm re-paces every change and never stabilises. | Change budget at most every 2-3 days, and by no more than 20% per change. |
| "I blocked 50 publishers because their CPA looked bad" | Most of those publishers likely had insufficient data — the CPA was noise, not signal. Mass-blocking starves the algorithm of supply. | Apply the site-block threshold (campaign clicks ≥ 500, conversions ≥ 5, per-site clicks ≥ 100 or 2/CVR). Unblock the ones that don't meet the bar. |
| "I set Target CPA way below current performance to force it down" | Setting Target CPA far below actual CPA usually kills delivery — the algorithm can't bid competitively at that target. | Target CPA is a last-resort lever, set within 10-20% of stable CPA after 3-4 days of delivery — not at launch, not aspirationally. |
| "I keep tweaking creatives, but performance gets worse" | Frequent creative swaps reset learning signals on the creative dimension. New creatives need their own learning. | Refresh on a schedule — every 2-4 weeks for most verticals, longer for finance/B2B. Refresh = new angle, not a word change. |

---

## 10. Outputs

Every walk through this flow produces:

| Output | Contents |
|---|---|
| **Findings** | The single strongest story (RCA path) OR the ranked outliers (Optimisation path), with attribution data + KPI gap per segment. |
| **Action items** | Max 2 (RCA) / max 5 (Optimisation). One concrete action per finding. Imperative voice. No "consider X." Each action names the MCP tool or Realize UI path. |
| **Confidence** | Per finding: strong (multi-week, multi-segment signal), moderate (single dimension, Standard tier data), weak (Minimum tier — recommend wait). |
| **Predicted impact** | Where possible, a directional estimate ("blocking the 12 zero-conversion sites should reduce wasted spend by ~$420/wk based on their current spend share"). Where not possible, say so. |
| **Validation timing** | When to re-check the impact ("re-evaluate in 7 more days of delivery once the change-class lag clears"). |

### Output discipline

**Gate 1 — Chat output by default.** Concrete, scannable, lead with the action.

**Gate 2 — Actions-only filter.** Output lists ACTIONS the user should take — not a narrative of what was analysed. Data and context appear ONLY when they explain *why* an action was recommended. Every bullet must answer: *"What do I do differently because of this?"* If a line doesn't recommend a change, it doesn't belong in the output.

---

## 11. Guardrails

- NEVER skip pre-checks P1-P5 (in the SKILL.md front-door).
- NEVER block a publisher / pause an ad / cut a dimension without passing the Section 1 statistical-volume tier (≥ Minimum tier).
- NEVER block a publisher without passing the site-block threshold (campaign clicks ≥ 500, conversions ≥ 5, site clicks ≥ 100 or `2/CVR`) AND the historical-top-N guard in `knowledge/site-management.md`.
- NEVER recommend a CPC bid change on the fully-automated strategies (Maximize Conversions / Target CPA / Maximize Value). Enhanced CPC and Fixed Bid: CPC changes ARE valid levers.
- NEVER recommend per-publisher bid moves on the fully-automated strategies — only block / unblock / whitelist.
- NEVER recommend per-item (per-ad / per-creative) bid changes on any strategy — that lever does not exist on Realize.
- NEVER recommend switching TO Fixed Bid as a "fix" — it disables algorithmic optimisation.
- NEVER recommend setting up new Custom Rules on a campaign that's still in the learning phase. For newer advertisers, monitor 1-2 weeks before any rule.
- NEVER recommend Target CPA as a routine optimisation step. Target CPA is a last-resort lever for campaigns at risk of being paused, applied AFTER a stable CPA baseline has been established (typically Day 3-4 of delivery, not at launch).
- NEVER recommend a creative refresh as a "word change." Refresh = new angle.
- NEVER recommend a budget reduction **as an optimisation lever for high CPA** — it reduces delivery without fixing inefficiency. Budget corrections for stated user errors (e.g., "I set my daily budget to $10,000 by mistake, it should be $100") are fine and helpful — that's a setup correction, not an optimisation.
- NEVER label a Learning-period campaign as "Underperforming." Use "Learning period." Acceptable actions are Hold / Pause / Wait.
- NEVER use a Learning-period campaign's metrics in cross-campaign reallocation math.
- NEVER conclude "external / algo" in the RCA path without ruling out signals 1-4 + 6 (in the SKILL.md).
- NEVER mention 50-99% auction loss to the user — it's normal.
- ALWAYS pair every observation with a concrete action item.
- ALWAYS respect the learning phase (7-14 days). Don't make aggressive changes during it.
- ALWAYS state the source of every claim (which MCP report, which date window, which row count).
- ALWAYS label the attribution model on every CPA / CVR / Lead / ROAS figure (CT only, VT only, Total CT+VT).
- ALWAYS lead with CVR for cross-account comparisons; lead with CPA for within-account analysis.

---

## 12. Cross-references

| File | Purpose |
|---|---|
| `knowledge/bidding.md` | Bid strategy mechanics, learning-period guard, bid-levers matrix (the canonical version). |
| `knowledge/budget.md` | Budget pacing, depletion-miss investigation, cross-period comparison discipline. |
| `knowledge/creative.md` | Sponsored Content + Display creative strategy, Gen AI AdMaker, landing pages, creative review, testing, fatigue checks. (Wilson-score ranking is in §3 of this file, not in `creative.md`. Display item payload shape lives in `knowledge/targeting.md`.) |
| `knowledge/targeting.md` | 6-dimension narrow-targeting diagnostic, Tier-1 market check, small-market caveat. |
| `knowledge/site-management.md` | Publisher block decisions, historical-top-N block guard, block-attribution framework. |
| `knowledge/custom-rules.md` | SpendGuard, Custom Rules best practices, learning-phase rule. |
| `knowledge/brand-safety.md` | DV / IAS pre-bid, topic exclusions, supply-quality filters — relevant when Section 2.2 surfaces a brand-safety block as the supply-side blocker. |
| `knowledge/campaign-structure.md` | Native vs Display lock-in, Campaign Groups, platform/device splits, cross-period % share comparison — relevant for "isolate top performer" / "fresh campaign" recommendations and for cross-period analysis discipline. |
| `knowledge/reporting-aggregation.md` | Pagination discipline + sum-reconciliation gate — mandatory for any MCP-report-based finding. |
| `knowledge/tracking.md` | Taboola Pixel / S2S verification, conversion-event design, troubleshooting. |
| `knowledge/environments.md` | Mail / Apple News / Lockscreen — environment expansion paths. |
| `knowledge/reach-estimation.md` | Campaign-level reach via `mcp__realize-mcp__get_campaign_reach_estimate`; cap handling. |
