# Bidding

## Overview

Bidding strategy determines how the Realize algorithm spends your budget to achieve conversions. The right strategy depends on campaign maturity, data volume, and optimisation goals. This file covers strategy selection, the bid-levers matrix, learning-phase behaviour with the Learning-Period guard, CPA troubleshooting, and scaling.

> **Attribution note:** CPA, CVR, and conversion metrics in this file refer to your selected attribution model in Realize. When reporting these metrics in analysis, always specify the model — `CPA (CT only)`, `CPA (Total CT+VT)`, or equivalent.

---

## KPI → Realize objective + bid strategy mapping

The campaign's primary KPI drives BOTH the `marketing_objective` AND the `bid_strategy`. Do NOT pick the objective from a funnel-stage label alone — funnel position is not the same as the Realize optimisation target.

| Primary KPI | Correct `marketing_objective` | Correct `bid_strategy` | Required additions |
|---|---|---|---|
| ROAS (return on ad spend) | `ONLINE_PURCHASES` | `MAX_VALUE` (preferred) or `MAX_CONVERSIONS` | Conversion rule (purchase event with value reporting); daily_cap per the per-strategy minimum (see "Bid Strategy × Budget minimums"). ROAS target (`roasGoal`) — see note below. |
| CPA (cost per acquisition) for sales | `ONLINE_PURCHASES` | `TARGET_CPA` (with `cpa_goal`) or `MAX_CONVERSIONS` | Conversion rule attached (purchase event); daily_cap ≥ 10× cpa_goal |
| CPL (cost per lead) | `LEADS_GENERATION` | `TARGET_CPA` or `MAX_CONVERSIONS` | Conversion rule (lead event); daily_cap ≥ 10× cpa_goal |
| App installs | `MOBILE_APP_INSTALL` | `MAX_CONVERSIONS` | Conversion rule (install event); ad-tracking SDK |
| Site traffic / engagement | `DRIVE_WEBSITE_TRAFFIC` | `SMART` (default) or `FIXED` (legacy) | None required |
| Pure awareness / impressions / reach | `BRAND_AWARENESS` | `SMART` or `FIXED` | None required |

> **Note on ROAS target (`roasGoal`):** Update-only, DCO accounts only, and **not currently exposed via the Realize MCP** — set in the Realize UI after creation. The plugin cannot adjust ROAS targets through `create_campaign` or `update_campaign`.

### Default bid strategy is MAX_CONVERSIONS, NOT FIXED

**FIXED CPC is never the default.** Even when a pixel + conversion rule are not yet in place, FIXED is not the fallback. The default bid strategy for any conversion-leaning campaign is `MAX_CONVERSIONS` (paired with `marketing_objective=ONLINE_PURCHASES` for ROAS / sales, or `LEADS_GENERATION` for lead generation).

**Only use FIXED when:**
- A fixed-CPC buy is the explicit requirement
- The campaign needs to honour a fixed CPM or CPC rate card exactly
- A regulated category requires manual bid control

For everything else, MAX_CONVERSIONS wins because it lets the algorithm bid dynamically per impression to maximise conversion volume under the daily budget. FIXED is a legacy strategy that limits the algorithm's ability to find efficient impressions.

### When the conversion rule isn't ready yet

ONLINE_PURCHASES / LEADS_GENERATION / MOBILE_APP_INSTALL **typically** require at least one conversion rule attached. But "typically" is not "always" — the platform allows performance-objective campaigns to ship without a rule and learn from click signals while the pixel is being installed.

**Recipe when pixel + purchase rule are pending:**

1. Stage the campaign with `marketing_objective=ONLINE_PURCHASES` (or LEADS_GENERATION for lead-generation campaigns), `bid_strategy=MAX_CONVERSIONS`. Omit `cpc` (algorithm decides). Set a reasonable daily_cap to give the algo room (rule of thumb: daily_cap ≥ 10× expected CPA).
2. If the goal is ROAS-driven AND value reporting will land later, use `MAX_VALUE` instead of MAX_CONVERSIONS — same shape, value-weighted optimisation.
3. If the API rejects the create call because no conversion rule is attached, attach a placeholder rule from the account (any active rule resolved via `get_conversion_rules`) and note that it is a placeholder — swap for the real purchase rule once the pixel is installed. If the account has no usable rule at all, one can now be created via `create_conversion_rule` through the `manage-campaigns` write gate — but the pixel still has to be installed in the UI before the rule records anything.
4. After the real conversion rule is created (Realize UI today; MCP write tool when available), call `update_campaign` to detach the placeholder and attach the real one. Bid strategy stays MAX_CONVERSIONS (or upgrades to MAX_VALUE).

NEVER ship a campaign as BRAND_AWARENESS + FIXED CPC just because the pixel is missing — that's a worse setup than MAX_CONVERSIONS on a performance objective with no rule attached.

### Why MAX_VALUE / MAX_CONVERSIONS beats FIXED CPC for performance campaigns

- **FIXED CPC**: advertiser sets the bid. Algorithm can't dynamically up-bid for high-value users. Suitable when the goal is pure reach at a known unit cost.
- **MAX_CONVERSIONS**: algorithm bids dynamically per impression to maximise conversion count under the daily budget. Outperforms FIXED for any conversion-driven goal.
- **MAX_VALUE**: same as MAX_CONVERSIONS but the algo weights toward conversions with HIGHER recorded value (when the pixel reports purchase amounts). The right call for ROAS-driven campaigns.
- **TARGET_CPA**: algorithm bids to hit a specified CPA. Use when there's a hard CPA ceiling.
- **SMART** (default for BRAND_AWARENESS / DRIVE_WEBSITE_TRAFFIC): modern automated bidding for non-conversion objectives.

---

## Bid Levers — What's Possible at Each Level

> **Editing note:** This matrix is referenced as canonical by `skills/manage-campaigns/references/mcp-write-surface.md` §4 and `skills/optimize-campaign/references/optimization-flow.md` §6. Update those downstream copies alongside any change here.

Before recommending any bid action, verify it is a valid lever for the campaign's bid strategy and the level you are operating at. The wrong recommendation gets rejected and erodes trust.

| Action level | Enhanced CPC / Fixed Bid | Target CPA | Maximize Conversions | Maximize Value |
|---|---|---|---|---|
| **Campaign-level Target CPA** | n/a | ✅ | n/a | n/a |
| **Campaign-level CPC bid** | ✅ (both `SMART` and `FIXED`) | ❌ algo decides | ❌ algo decides | ❌ algo decides |
| **Campaign-level CPC cap** | ❌ API 400 | ❌ API 400 | ✅ (last-resort) | ❌ API 400 |
| **Campaign-level daily budget** | ✅ | ✅ | ✅ | ✅ |
| **Publisher-level bid boost / de-boost** | ✅ | ❌ | ❌ | ❌ |
| **Publisher-level block / unblock / whitelist** | ✅ | ✅ | ✅ | ✅ |
| **Item-level (creative / ad) bid, priority, weight** | ❌ never | ❌ never | ❌ never | ❌ never |
| **Item-level pause / activate** | ✅ | ✅ | ✅ | ✅ |
| **Item-level create / duplicate / edit** | ✅ | ✅ | ✅ | ✅ |
| **Day-parting (hour blocks)** | ✅ | ✅ | ✅ | ✅ |

**Legend:** ✅ valid lever · ❌ not available — algo / platform decides · n/a not applicable to this strategy

> **Note on Target ROAS (`roasGoal`):** Target ROAS is **not exposed via the Realize MCP today** — it is update-only and DCO accounts only, settable in the Realize UI after creation. There is intentionally no Target ROAS row in this matrix because the plugin cannot adjust it. If a user asks the plugin to set ROAS, refuse the write and route them to the Realize UI.

### Per-item bidding does NOT exist in Realize

Realize has **no per-item (per-creative / per-ad) bid lever on any bid strategy.** Advertisers cannot bid on individual ads, raise / lower an item's bid, prioritise one ad over another, or set per-ad weights / multipliers. The algorithm decides which items to serve based on performance and creative-level optimisation signals — not advertiser-controlled bid inputs.

The only valid item-level (creative / ad) actions are:

- **Pause** an item
- **Activate / unpause** an item
- **Create** a new item
- **Duplicate** an item
- **Edit** an item's content (title, description, thumbnail, URL, CTA, etc.)

To shift spend toward winning creatives: pause underperformers (the algo redistributes), or create more variants of the winner. Never phrase this as a bid action.

### Per-publisher bidding requires Enhanced CPC

Per-publisher bid boost / de-boost is **only valid on Enhanced CPC / Fixed Bid** campaigns.

For Maximize Conversions / Target CPA / Maximize Value campaigns, the **only** publisher-level levers are:

- **Block** a publisher
- **Unblock** a previously blocked publisher
- **Add to whitelist** (when the campaign uses approved-list mode)

The algorithm redistributes spend toward better-performing publishers automatically once losers are blocked — no bid action is needed or possible.

### Common mistakes this rule prevents

- "Raise bid +20% on AOL Web" inside a Target CPA campaign → ❌ publisher bidding locked on Target CPA
- "Increase per-creative bid on the winning ad" → ❌ per-item bidding does not exist on any strategy
- "Set Target CPA on a Maximize Conversions campaign" → ❌ Maximize Conversions has no CPA goal field
- "Lower CPC on a Target CPA campaign" → ❌ algo decides CPC under Target CPA
- "Boost bid 20% on top creative" inside an Enhanced CPC campaign → ❌ Enhanced CPC allows publisher bid moves, not per-item

---

## Strategy Selection

The primary recommendation is **Maximize Conversions** for best performance. Other strategies exist for specific scenarios.

### Strategy Decision Table

| Strategy | Automation | Budget Requirement | Baseline Bid | First Days Expectation |
|---|---|---|---|---|
| **Maximize Conversions** | Fully automated | Daily: 10× expected CPA goal. $50 minimum if CPA is under $5. | N/A (auto) | First 2-4 days: CPA fluctuations. Then CPA decreases and stabilises, conversion volume increases. **Strongly recommended not to adjust the campaign during this window.** |
| **Maximize Conversions + Target CPA** | Fully automated | Daily: 10× expected CPA goal. $50 minimum if CPA is under $5. | Set Target CPA with a realistic goal | Target CPA can reduce campaign scale if the target is far from actual performance. **Apply only as a last resort when performance is so poor the campaign is at risk of being paused.** |
| **Enhanced CPC** | Semi-automated | Daily: 5× CPA goal. Monthly: 150× CPA goal. | Known CVR: CPC = CPA goal × CVR. Unknown CVR: similar segment average CPC. | Learning phase ~11 days. Performance less stable, fluctuations in CTR and CPA during adjustment. |
| **Fixed Bid** | Manual | According to advertiser requirements | According to advertiser requirements | N/A |

### Strategy Selection Rules

1. **Default: Maximize Conversions** — the right choice for fully automated bidding.
2. **Add Target CPA only** if CPA cost control is more important than conversion volume. Target CPA is by design more conservative and prioritises cost over scale.
3. **Use Enhanced CPC** when you want more control over CPC. Enhanced CPC uses your base CPC as the bidding benchmark.
4. **Use Fixed Bid** only when complete bid control is required — focusing on impressions, bidding on vCPM / CPM, or when not tracking conversions.

### Critical Target CPA Rules

- **Never set Target CPA immediately at campaign launch.** Allow the campaign to gather performance data for the first 3-4 days. Once CPA has stabilised, use that data as the benchmark.
- Setting Target CPA too early can significantly prolong the learning phase and delay stabilisation.
- Once Target CPA is set, allow the algorithm to optimise. The full budget may not deplete due to the CPA constraint.

### Target CPA calibration — set the target near actual current CPA, not at the user's aspirational goal

When recommending a Target CPA value, the value you set matters as much as the decision to use Target CPA at all. The rule:

**Set the Target CPA at or above the campaign's actual current CPA. Then drop gradually.**

- The user's stated CPA *goal* (e.g., "I want CPA = $16") is the destination, not the starting Target CPA value.
- If the campaign's actual current CPA is $26, starting Target CPA at $16 is too aggressive: the algorithm will throttle bids hard to chase a target it can't currently hit, scale will collapse, and the campaign may stop spending entirely.
- Start Target CPA at ~$26 (or even slightly higher — $28–$30). Once the campaign stabilises at that level for **5–7 days**, drop the target by ~10–15%. Continue stepping down only after each new level stabilises.
- If you cannot get within striking distance of the aspirational goal after 2–3 step-down cycles, the path forward is **NOT** to lower the target further — it's to address what's preventing CPA from dropping (creative refresh, audience expansion, site exclusions, landing-page fixes).

**Why this matters:** A Target CPA set far below actual CPA is the same shape as "set Target CPA aspirationally" — the algorithm cannot hit it, scale drops, and the campaign produces less data, which makes the next optimization round harder. Calibration is a stepwise descent, not a single jump.

### When to Switch Strategies

| Current State | Signal | Action |
|---|---|---|
| Maximize Conversions, CPA too high | CPA consistently above goal after learning phase | Add Target CPA — set at or near current actual CPA, not an aspirational target. Expect a scale drop if the target is lower than existing performance. Check average CPA from past weeks using post-click performance only. |
| Maximize Conversions, scale is low | Budget not depleting | Use auction insights to investigate. Consider expanding targeting and refreshing ads. Raise budget, broaden targeting. |
| Maximize Conversions, high CTR low CVR | Good clicks but no conversions | Reassess landing-page quality, check creative relevance, adjust targeting. |
| Maximize Conversions, high CVR low scale | Converting well but not enough volume | Raise bid, expand targeting, consider splitting out top placements. |
| Maximize Conversions, steady scale but high CPA | Spending but CPA above goal | Add predictive or CRM audience layering, refresh creative, refine site list. |
| Any strategy, stalled scale post-launch | Campaign not growing | Wait the full 7-14 day learning phase. Review targeting or bid constraints. Use auction insights. |
| Enhanced CPC, performance acceptable | Stable and competitive | Consider gradually shifting to Maximize Conversions for more automation. |

### Bid Ceiling for Maximize Conversions

Apply a bid ceiling only if CPA efficiency is critical **and** scale is strong. Availability is limited to select advertiser types.

---

## Learning Phase

### What Happens During Learning

The first 2-4 days show CPA fluctuations. As learning progresses, CPA stabilises and conversion volume increases.

**Critical: strongly recommended not to adjust the campaign during the learning phase.**

### Learning Phase Duration

Allow **7 to 14 days** for a campaign to exit learning. Avoid any major changes in this stage.

### Learning-Period Guard (mandatory)

A campaign satisfies the **Learning-Period guard** when ALL three conditions hold:

1. Campaign was created within the **last 7 calendar days**.
2. Campaign has **fewer than 30 conversions** on its goal in lifetime.
3. Campaign has **not yet completed a full bid-strategy learning window** — a 5-7 day sub-window inside the broader 7-14 day campaign learning phase, during which the algorithm is calibrating for Maximize Conversions / Target CPA / Maximize Value.

When the guard fires:

- **Label** the campaign as **"Learning period"** — never "Underperforming," "Failed," or "Bad performance."
- **Do NOT recommend** bid changes, Target CPA changes, or daily-cap changes.
- **Do NOT use** the campaign's metrics in cross-campaign benchmarks or reallocation math.
- **Acceptable actions:** Hold (do nothing), Pause (only if account-wide damage is severe), or Wait.
- **Re-evaluate** after the 7-day mark + at least 30 conversions.

**Exceptions** — guard does NOT fire on:

- A duplicate of an existing campaign — inherits learning from source within ~24h. Treat as mature after Day 2.
- A re-launched campaign after a long pause may show as "old" by start_date but is effectively learning again. If restart is within last 7 days after > 14 days of no spend, treat as Learning.
- A goal swap restarts learning even on a mature campaign.

### Overspending During Learning

If the campaign is pacing ahead of expectation:

1. Allow the campaign **2-3 days to stabilise**.
2. During learning, the algorithm is trying to optimise for the selected conversion event and get enough data to finish learning faster.
3. **Reducing budget too early can reset the learning phase, slow optimisation, and negatively affect CPA and CPC.**
4. Only intervene if there are strict budget restrictions — and even then, prefer a moderate adjustment over a significant reduction.

### Underspending During Learning

| Check | Action |
|---|---|
| Conversion tracking | Ensure the conversion event is implemented and firing correctly. |
| Creative approval | Verify all creatives are approved and active. |
| Audience targeting | Check whether targeting is too restrictive. |
| Bidding (Enhanced CPC / Fixed) | Consider slightly increasing bids to stay competitive in auctions. |
| Bidding (Maximize Conversions) | Consider increasing daily spend by up to 20% of existing spend. |
| Pace Ahead feature (UI-only — not exposed via the Realize MCP) | Use to accelerate spend for a specific campaign if needed; set in the Realize UI. |

For display campaigns specifically, also check:

- Upload recommended creative sizes (Mobile: 300×250, 300×600, 320×50, 720×1280; Desktop: 300×250, 300×600, 970×250, 728×90, 160×600).
- Do not block channel publishers (these are sites with header-bidding supply).
- Do not block publishers based on Sponsored Content campaign performance or past experiences.
- Use Maximize Conversions as the bidding strategy.

### Extended Learning Phase

If the learning phase extends beyond 14 days:

| Check | Action |
|---|---|
| Conversion volume | For lower-funnel goals (e.g., purchases), consider adding earlier-funnel conversion events to help the algorithm collect enough data. |
| Audience targeting | If the audience is too narrow, expand targeting or add new segments. Use the Reach Estimator to validate sufficient scale. |
| Creative performance | Use auction insights to identify campaign diversity or other blockers restricting delivery. |
| Bid / spend (Enhanced CPC) | Consider adjusting the bid to allow more flexibility during optimisation. |
| Bid / spend (Maximize Conversions) | Consider increasing the budget by up to 20% of existing spend so the algorithm can explore additional opportunities. |

---

## Post-Launch CPA Volatility

CPA volatility immediately after launch is common — the algorithm is learning and optimising. **Allow 2-3 days for CPA to stabilise.**

### If a CPA Spike Persists

| Step | Action |
|---|---|
| 1 | **Review spend vs. CPA alignment.** Check whether daily spend is sufficient and the CPA goal is realistic. |
| 2 | **Consider adding Target CPA.** On Maximize Conversions, adding Target CPA controls cost. Be mindful this can reduce daily spend — plan for the reduction. |
| 3 | *(Optional)* **Bid ceiling.** If your CPC goal is strict, consider a bid ceiling to cap CPC. |

### CPA Spike Signal Table

> All CPA / CVR numbers below assume your selected attribution model — state it explicitly in any answer that uses these patterns.

| Signal | Suggested Actions |
|---|---|
| High CTR, Low CVR | Reassess landing-page quality, check creative relevance, adjust targeting. |
| High CVR, Low Scale | Raise bid, expand targeting, move to Maximize Conversions (if not already), consider splitting out top placements. |
| Steady scale, High CPA | Add predictive or CRM audience layering, refresh creative, refine site list. |
| Stalled scale post-launch | Wait the full 7-14 day learning phase. Review targeting or bid constraints. Use auction insights. |
| Maximize Conversions active, CPA too high | Add Target CPA — expect a scale drop if the target is lower than existing performance. Check average CPA from past weeks (post-click only). Consider blocking underperforming sites using Custom Rules. |
| Maximize Conversions active, scale is low | Use auction insights. Consider expanding targeting and refreshing ads. Raise budget, broaden targeting. |

---

## Troubleshooting: Fluctuating CPA

Route by bidding strategy.

### Maximize Conversions

1. Ensure you are not making frequent changes (especially to budget). If adjusting budget, use increments / decrements of up to **20% at a time** and allow **2-3 days** for recalibration.
2. Make sure **SpendGuard is not disabled**, and that Custom Rules are aligned with real KPIs to protect against underperforming sites or ads.
3. If no Custom Rules exist, **manually review the site report** and block underperforming sites. Also manually review the ad report, pause underperforming ads, and add new ads.
4. **Review ads** — look for high-CTR / high-spend ads with post-click underperformance. Check whether messaging is misleading or over-promising.

### Enhanced CPC or Fixed Bid

1. Review and **adjust bids** — bids may be restricting campaign performance and causing CPA fluctuation.
2. Review **auction insights** to understand whether delivery is constrained by low bid competitiveness or site-level restrictions.

### All Strategies

- **Revisit audience targeting.** Restrictive targeting leads to fluctuations. Consider adding segments to broaden the audience.
- **Evaluate external factors.** Seasonality, market trends, or competitive activity can affect CPA.

---

## Troubleshooting: High CPA

High CPA indicates inefficiency. Check in this order.

| # | Check | Action |
|---|---|---|
| 1 | **Conversion event** | Ensure the event has enough data or the campaign is able to finish learning and gather enough conversion data. If the conversion event is extremely rare, higher CPA is expected — plan accordingly and start with a larger budget, or add earlier-funnel conversion events. |
| 2 | **Budget** | Restrictive budget limits the algorithm's ability to spend and leads to higher CPA. Consider increasing the budget to stay competitive. |
| 3 | **Audience focus** | Going too broad can result in wasted spend and higher CPAs. Focus on high-intent audiences using mail and search signals, or narrow to top-performing demographic segments. (Too narrow can also impact scale.) |
| 4 | **Creative and landing-page alignment** | A mismatch between creative messaging and landing page leads to higher CPAs. Ensure landing-page messaging aligns with creative messaging. Ensure the ad is not over-promising or misleading. |

---

## Scaling: Adjusting Bids

### Maximize Conversions

Increase daily spend by **up to 20%**, allowing the algorithm room to look for additional opportunities.

### Enhanced CPC or Fixed Bid

Apply a **bid boost** when the campaign shows stable performance and **budget pacing is below 80-90%**.

### Pro Tip

Consider using the **Performance Simulator** (if eligible) to identify potential adjustments for enhanced performance.

---

## Guardrails

- Never set Target CPA immediately at campaign launch — wait 3-4 days for data.
- Never set Target CPA far from actual performance — it can significantly decrease scale.
- Never make frequent campaign changes during the learning phase — this resets learning and worsens performance.
- Never reduce budget aggressively during learning — moderate adjustments only, and only if absolutely necessary.
- Never judge CPA performance in the first 2-4 days — this is normal learning volatility.
- Never adjust budget by more than 20% at a time.
- Never recommend per-item / per-creative bid changes — they don't exist on any Realize bid strategy.
- Never recommend per-publisher bid moves on Maximize Conversions / Target CPA / Maximize Value — only block / unblock / whitelist.
- Never label a Learning-Period campaign as "underperforming" — it is calibrating, not failing.
- Always allow 2-3 days for recalibration after any budget change.
- Always use Maximize Conversions as the default bidding strategy.
- Always allow 7-14 days for the learning phase before evaluating.
- Always check post-click CPA performance (not just last-click) when setting Target CPA benchmarks.
- Always verify a recommended bid action maps to a ✅ cell in the Bid Levers matrix above.

## Common Mistakes

1. **Setting Target CPA too early.** Prolongs learning phase, delays stabilisation. Wait 3-4 days for data first.
2. **Setting an aspirational Target CPA.** Algorithm cannot hit an unrealistic target, scale drops. Set at or near actual current CPA.
3. **Frequent budget changes during learning.** Resets learning each time. Make one change, wait 2-3 days.
4. **Reducing budget to fix high CPA.** Limits the algorithm's ability to optimise. Address root cause (tracking, creatives, targeting) instead.
5. **Blocking publishers based on Sponsored Content performance in display campaigns.** Sponsored Content and Display have different dynamics — evaluate each campaign type independently.
6. **Using Fixed Bid for conversion campaigns.** No conversion optimisation. Use Maximize Conversions unless there is a specific reason not to.
7. **Recommending per-creative bid moves.** No such lever exists on any bid strategy. Use pause / activate / create / duplicate / edit.
8. **Treating a Learning-Period campaign as a failure.** Tweaking it resets calibration. Hold and wait.

## Pro Tips

- Maximize Conversions without Target CPA is designed to spend the full daily budget. If it is not spending, the problem is targeting, creatives, or supply — not the bid strategy.
- SpendGuard is on by default. It is a predictive model that automatically identifies underperforming sites and caps or blocks them. It does not require action unless you want to disable it.
- Enhanced CPC base-bid formula when CVR is known: `CPC = CPA goal × CVR`. When CVR is unknown, use similar-segment average CPC.
- For Enhanced CPC: daily budget should be 5× CPA goal, monthly budget should be 150× CPA goal.
- When CPA spikes persist after learning, check average CPA from past weeks looking at **post-click performance only** before setting a Target CPA.
- The Pace Ahead feature can accelerate spend for a specific campaign when delivery is slow. **Note:** Pace Ahead is not exposed via the Realize MCP — it is set in the Realize UI; the plugin cannot enable or adjust it through `create_campaign` / `update_campaign`.
