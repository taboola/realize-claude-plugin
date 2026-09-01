# Targeting

## Overview

Targeting determines who sees the campaign. The right targeting strategy balances reach (enough volume for the algorithm to optimise) against precision (showing ads to likely converters). This file covers audience strategy by objective, all available targeting solutions, expansion, retargeting, predictive audiences, and how to diagnose narrow targeting that constrains delivery.

> **Attribution note:** When reporting CPA, CVR, or any conversion metric tied to a targeting segment, always name the attribution model explicitly (e.g., `CPA (CT only)`).

## Where audiences live — marketplace vs. account-resident

A given Realize account does NOT need to "contain" demographic, interest, intent, or 3P segments before they can be used. These live in Realize's network-wide **marketplace catalogue** and are available to every active account by default.

**Do NOT treat empty `search_audiences` results as an error.** The two MCP discovery tools serve different scopes:

| Discovery tool | Returns | When it's empty for a fresh account, that's fine |
|---|---|---|
| `search_audiences` | Account-RESIDENT custom audiences only — pixel-built segments, CRM uploads, "All Website Visits", combined audiences saved on the account. | ✅ Yes — a brand-new account has no pixel data + no CRM uploads yet. |
| `search_contextual_segments` | Network-wide marketplace catalogue — demographics (age / gender), interest verticals (health-conscious, weight management, immune health, energy / focus, etc.), 3P data partners (Audience One, Bombora, Connexity, Eyeota), MRT bundles. | ❌ Never expected to be empty for a US-targeted campaign. |
| `search_lookalike_audiences` | Account-RESIDENT lookalike seeds (pixel-based predictive, CRM lookalike, PBP). | ✅ Yes — these require a seed (pixel data or CRM upload) which a fresh account won't have. Mark "seed pending" rather than failing. |
| `get_conversion_rules` | Account-RESIDENT conversion rules (Taboola Pixel events, S2S events, engagement rules). Returns ACTION rules only — pixel audience rules are excluded. | ✅ Yes — fresh accounts have no pixel installed yet. |

**Operating rule:** If the user calls for "Women 35-64, health-conscious, weight-management interest," resolve those via `search_contextual_segments`. Do NOT expect them in `search_audiences`. If `search_audiences` is empty for a fresh activation account, proceed and note: "no account-resident custom audiences yet — using marketplace segments + targeting will broaden once pixel/CRM seeds land." NEVER raise this as a blocking error.

### Declared demographics (age, gender) — exist platform-wide even when MCP queries don't surface them

Female / Male / age-bucketed (18+, 25+, 35+, etc.) audiences EXIST in the broader Realize marketplace via 1P data partners (Yahoo, Bombora, Connexity, Eyeota, Audience One). They are NOT always returned by `search_contextual_segments` (which trends content-category-flavoured) and they may not surface in `search_audiences` until they have been surfaced or saved at the account level. **Do not assert "Women / Female / Men / age-X-Y demographic does not exist on Realize"** based on an empty MCP query result.

When demographic targeting is required and MCP search results don't surface a match:
- Note the gap explicitly: "declared demographic (Female / age-N-M) not surfaced by current MCP discovery tools — layer it in via the Realize UI marketplace browser at activation time."
- Don't substitute "no demographic exists." The demographic layer can be applied in the Realize UI marketplace browser even when MCP discovery doesn't surface it.

Gender-specific exact age ranges (e.g., F35-64) may need to be composed from broader buckets (e.g., F25+ + F65- excluding) in the UI.

**Per-account write tools (new conversion rules, CRM segments, lookalike seeds) are not yet on the public Realize MCP.** Create new conversion rules / CRM segments / lookalike seeds in the Realize UI after campaign creation — the public MCP doesn't yet expose write tools for these.

---

## Audience Strategy by Objective

### ⚠ Market-tier check — read this BEFORE the strategy table

**If the campaign's market is NOT in the Tier 1 list below, do not apply the objective-based strategy table.** Start with broad targeting (run-of-network + premium publishers + contextual layer if needed). Flag this prominently — narrow plans in non-Tier-1 markets are a common cause of stalled delivery that's hard to diagnose after the fact.

Plain-language framing:
> "Your market has more limited audience data than the Tier 1 markets (US, UK, AU, etc.). The recommended starting approach is **broad targeting** — narrow segments may not have enough audience pool to deliver, and restrictive targeting upfront depletes the pool faster than the algorithm can learn. We can refine after the campaign has data."

### Tier 1 regions — where the objective-based strategy below applies

The strategy table below assumes sufficient 1st-party data volume to scale within the recommended targeting layers. That volume currently exists in **Tier 1 regions**:

| Region group | Tier 1 markets |
|---|---|
| **APAC** | Taiwan (TW), Hong Kong (HK), Singapore (SG), Australia (AU), Malaysia (MY), Philippines (PH), India (IN), Indonesia (ID) |
| **EMEA** | Romania (RO), United Kingdom (UK), France (FR) |
| **US & LATAM** | United States (US), Canada (CA), Brazil (BR) |

**For any region NOT listed above:** start with **broad targeting** and layer additional targeting solutions to find pockets of performance or scale across audience segments. The objective-based strategy table below is the starting point only after the campaign has shown which audience layers actually deliver in that market. Restrictive targeting upfront on a non-Tier-1 market will deplete the audience pool faster than the algorithm can learn.

### Strategy by Campaign Objective (Tier 1 only)

| Objective | Strategy | Details |
|---|---|---|
| **Upper-Mid Funnel (Engagement / Brand Awareness)** | Start broad → narrow after identifying best audiences | Recommended: contextual / interest targeting. |
| **Maximising Efficiency (Low CPA / ROAS)** | Start with high-intent audiences | Start with Search Keyword Retargeting (SRT — active intent) and Mail Domain Retargeting (MRT — transaction signals, competitor conquesting). Add Pixel or CRM Retargeting after a few days to optimise on first-party data. |
| **Scale with Performance** | Start with MRT bundles or Contextual | MRT bundles (categories fitting your vertical) or Contextual Targeting (Interests) to fuel the algorithm. Add Predictive Audiences when using a pixel seed. US accounts can also use CRM Lookalike. |
| **Niche / Persona Accuracy** | Prioritise declared first-party demographics | Use declared over inferred data for zero wastage. Avoid relying solely on third-party segments unless first-party scale is insufficient. |

### All Available Targeting Solutions

| Audience Type | Best Practices |
|---|---|
| **Taboola First Party Audiences** | Leverage declared demographic data and behaviour signals from the premium publisher network. Layer with additional segments (e.g., interest in shopping **and** 25-45 age range). By default OR logic is applied for multiple segments; AND logic is available but **do not add more than 5 segments with AND logic** — it restricts reach. |
| **High Intent — Mail Domain Retargeting (MRT)** | Curate audiences based on incoming mails from competing brands, your brand, or proxy signals. Create the segment **in advance** — allow **24-48 hours** for the audience to build. **Minimum 1,000 MAU** required; a warning appears if the audience is too small. |
| **High Intent — Search Keyword Retargeting (SRT)** | Curate audiences based on search queries for competitor brands. Use **broad match** for maximum scale. Create the segment in advance (24-48 hours). Ensure creative headline / description matches segment criteria — e.g., targeting competitor shoe brands → highlight brand / product USPs. |
| **Contextual and Topic Segments** | Select based on the audience's reading interests. When using contextual segments, tailor creative messaging to the segment selection. |
| **Optimise for Engagement** | Use engagement conversions (time on site, session depth) to target high-intent audiences. Relevant for mid-to-lower funnel goals. Use as part of retargeting strategy or alongside additional segments to lead users through the funnel. |
| **Third-Party Marketplace Segments** | Select from 20+ third-party data providers including Audience One, Bombora, Connexity, Eyeota. Additionally layer with Taboola First Party Audiences (demographic or interest-based). |
| **Advertiser Pixel Audiences (first-party)** | Use the pixel for retargeting (users who clicked on ads or visited the website). Use as part of inclusion / exclusion strategy — e.g., excluding users who already completed a conversion event. |
| **Predictive Audiences** | Use alongside always-on or broad-targeted campaigns as complementary targeting. **Always create a new campaign** for a predictive audience. Can be built from pixel or S2S event. **Mandatory: 100 conversions** needed to create a segment. Build the segment and allow up to 48 hours to activate before evaluating whether to expand. |
| **CRM Segments** | Upload CRM list to retarget. Minimum **1,000 user records** recommended. Watch the Reach Estimator — low volume leads to low spend and performance. **Available in select markets only.** |
| **CRM Lookalike** | **US-based accounts only.** Set the lookback window long enough to capture the entire consideration phase (max 180 days). Regularly update source data for maximum reach. |

### Pro Tip

Monitor the **Reach Estimator** to ensure the audience isn't too narrow. Start broad, then refine targeting based on performance.

Use the **Audience Toolbox** to find additional audience segments.

---

## Narrow Targeting Diagnostic — 6-Dimension Priority Order

When the Reach Estimator flags a campaign as narrowly targeted (lower-bound reach < 1,000 users — the threshold that triggers Realize's "Your targeting is too narrow" banner), inspect these dimensions **in this priority order**. The first dimension that explains the bottleneck is usually the right one to broaden.

| # | Dimension | Common restrictive patterns to look for |
|---|---|---|
| 1 | **Geo** | Single small country, very few cities / regions, restrictive DMA, postal-code targeting. Check `country_targeting`, `region_country_targeting`, `dma_country_targeting`, `city_targeting`, `postal_code_targeting`. |
| 2 | **Audience** | Small custom audience segments, narrow lookalikes, niche behavioural segments. Check `audiences_targeting`, `lookalike_audience_targeting`, `contextual_segments_targeting`. |
| 3 | **Publisher targeting** | Small whitelist (approved-list mode) or aggressive exclusions. Check `publisher_targeting`. |
| 4 | **Bidding** | Fixed CPC well below market, or no automated bid strategy on a campaign that needs one. Check `bid_strategy` and `cpc`. |
| 5 | **Language / quality level** | Restrictive language constraint, EXTENDED quality level on small markets. |
| 6 | **Platform / OS** | Single platform or single OS in low-volume geos. Check `platform_targeting`, `os_targeting`, `browser_targeting`, `connection_type_targeting`. |

### Diagnostic response shape

When the campaign is narrowly targeted, the diagnosis must include:

- **Campaign name + ID** (so the user knows exactly which entity is in scope).
- **The specific narrow dimension(s)** with concrete details (which countries, which segment names, which bid value).
- **A concrete broadening recommendation** for each dimension flagged.
- A **single short follow-up question** inviting the user to act.

### Single-issue diagnosis (≤ 80 words)

> **{campaign_name}** ({campaign_id}) — Scale is constrained by one narrow setting:
> - {dimension}: {what is restrictive, with specifics}
>
> Recommended action: {concrete broadening}.

### Multi-issue diagnosis (≤ 120 words)

> **{campaign_name}** ({campaign_id}) — Scale is constrained by {N} narrow settings:
> - {dimension 1}: {specifics}
> - {dimension 2}: {specifics}
> - {dimension 3}: {specifics}
>
> Recommended actions to unlock scale:
> 1. {concrete broadening for dimension 1}.
> 2. {concrete broadening for dimension 2}.
> 3. {concrete broadening for dimension 3}.
>
> Applying any one of these will help; combining them gives the largest reach uplift.

If the campaign is **not** narrowly targeted, say so plainly — narrow targeting is not the cause; route to a different diagnostic (CPA, CVR, plateau).

---

## Inventory and Placements

### Starting Point

The recommended starting point for most advertisers is **premium editorial supply** — relevant across all marketing objectives and verticals. This gives flexibility to adjust site targeting (include / exclude specific sites).

### Environment Expansion (Once Performance Stabilises)

| Environment | Marketing Objectives | Recommended Verticals | Guidance |
|---|---|---|---|
| **Mail Inventory** | Lead Generation, Online Purchases, Website Engagement | Retail, Finance, Tech / Telco, CPG, Travel | High-intent, lean-in environment. Best introduced as an incremental campaign once premium editorial supply stabilises. |
| **Apple News & Stocks** | Page Views, Engagement | Premium publishers; content-consumption or editorial KPIs | Quality traffic and engaged readership. Start with Run-of-Network; add contextual segments only if performance requires refinement. |
| **Lockscreen Inventory** | Efficient Traffic Generation, Geo-targeted Leads / Conversions | Search advertisers, Premium publishers, Home & Garden, Automotive, Regional campaigns | Cost-efficient reach and localised impact. Pair with strong CTAs and geo-relevant messaging. |

---

## Scaling: Audience Expansion

### When to Expand

- Noticing saturation in reach (impressions / views).
- Budget depletion is lower than expected.
- Targeting a niche audience while performance is OK.

### Expansion Options

| Option | How |
|---|---|
| **Audience Exploration Tab** | For Run-of-Network campaigns, use the audience-exploration tab to get insights into segments you're not currently targeting. |
| **Add similar segments** | For campaigns targeting specific audiences, add similar audience segments or use combined audiences (interest + intent + demographic). |
| **Marketplace / Taboola First Party Audiences** | Narrow down on specific audiences based on your product / service. |
| **Predictive Audiences** | Reach high-intent audiences based on pixel / S2S events. Ensure the conversion event has sufficient data (up to 100 conversions). Advertisers optimising toward page views or similar upper-funnel events are not eligible. |

**Why this works:** Broadening the audience base using data-backed insights allows the algorithm to find new conversion opportunities while maintaining efficiency through predictive and contextual alignment.

### Scaling Levers Summary

| Lever | When to Use | Guidance | KPIs to Monitor |
|---|---|---|---|
| **Audience expansion** | Reach saturation, or targeting niche while performance is OK | Add marketplace or Taboola First Party Audiences + engaged audiences (including attentive audience) | CPA / CPC. Watch the Reach Estimator. |
| **Budget increase** | Budget depletion OK and CPA / CPC acceptable, or seasonality adjustments | Increments of **up to 20%** at a time. Allow campaign time to recalibrate before further changes. | CPA / CPC / ROAS. Monitor pacing. |
| **Site exclusions** | Spend going to sites not contributing conversions, or with high CPC / CPA | Monitor site performance, exclude 10-20 underperforming sites | CVR. Continue monitoring post-exclusion. |
| **Custom Rules** | Specific rules for select campaigns | Start with broad rules to avoid significant performance impact (e.g., block sites with spend but no conversions over 7 days). | Spend / CPA. Monitor rules action under the Rules tab. |

---

## Retargeting Campaigns

### Predictive audience campaigns — signal dependencies beyond the seed event

A predictive audience campaign is fed by the predictive model trained on the seed event (typically a pixel conversion or S2S event). **The model's freshness depends on continuous conversion volume** — and that volume often comes from *other* campaigns on the same account that are dropping conversion signals into the same pixel.

When the user reports a predictive audience campaign that "stopped delivering" or "lost scale", check these signal-source dependencies before concluding the campaign itself is the problem:

| Signal source | What can starve the predictive model | Diagnostic check |
|---|---|---|
| **Other non-predictive campaigns on the same account paused or de-budgeted** | The predictive model relied on those campaigns' conversion volume to stay calibrated. Pause them and the model degrades within days. | Pull the change history on sibling campaigns. Were any paused or had budgets cut in the same window as the predictive scale drop? |
| **The seed event itself stopping or being redefined** | If the pixel was reinstalled, the conversion rule was edited, or the event name changed, the seed signal can break silently. | Check `get_campaign_history_report` for conversion-event changes and the pixel installation status. |
| **Audience pool exhaustion** | Predictive audiences are still bounded by the addressable population. After weeks of running, the campaign can saturate the in-pool users and slow naturally. | Check the Reach Estimator's monthly-users range vs. the campaign's cumulative reach. |

**Important:** *Don't apply standard Maximize Conversions troubleshooting to a predictive campaign without checking signal sources first.* A predictive campaign with a stale signal looks identical to a "low budget" or "audience too narrow" problem on the surface — but the fix is different.

### Native vs Display creative type — they are distinct campaign types, not creative variants within one campaign

A campaign is **either** Native **or** Display, locked at the first item-creation call (under `pricing_model=CPC`) or at the `create_campaign` call (under `pricing_model=VCPM`). They can't be mixed under one campaign.

**Creative material under each:**

| Campaign type | What "items" look like |
|---|---|
| **Native** | Items use `creative_type` values like `STATIC_IMAGE`, `PERFORMANCE_VIDEO`, etc. These render in-feed under the publisher's editorial chrome. |
| **Display** | Items use `ad_tag` (3P JS tag) or `asset_url` + `dimensions` (1P-hosted image / animation). These render as banner ads in standard IAB sizes. |

**The common mistake:** describing a Native campaign whose items are `STATIC_IMAGE` or `PERFORMANCE_VIDEO` as "having no Display creatives" or "in EMPTY_DISPLAY learning state because there are no Display ads". This conflates two distinct concepts:
- A Native campaign with image-format items is **Native**, not "Display with no Display ads".
- `EMPTY_DISPLAY` as a learning-state value means the *Display* component of optimization has no signal — but on a Native-locked campaign this is expected and irrelevant; the campaign is not serving Display inventory at all.

When diagnosing a Native campaign's underperformance, do not recommend "add a Display creative". The right framing is: add **more Native items** (more variety of titles, thumbnails, descriptions) — or, if the user wants Display reach, **launch a separate Display campaign**.

### Pixel retargeting vs CRM retargeting — when to use which

Both unlock first-party signal but they pull different audience populations.

**Pixel retargeting (pixel audiences):**
- **What it captures:** anonymous prospects + "window shoppers" based on website behaviour (page visits, time on site, scroll, event interactions).
- **Value:** identifies highly engaged users who have already touched the site — the algorithm reaches a known-warm pool.
- **Use case:** recommended when there's **high website traffic but low conversion rates** — the audience is engaged enough to retarget, and the pixel captures intent the CRM list doesn't.

**CRM retargeting (CRM audiences):**
- **What it captures:** known leads, past buyers, and churned users — first-party records you own.
- **Value:** connects data to action at scale; future-proofed first-party data that survives third-party cookie loss.
- **Use case:** recommended when there's **a large email list that's not being reached** by other channels, and when **re-engaging lapsed customers** is the objective.

In practice, both can be layered: pixel for engagement-driven prospecting, CRM for owned-audience re-engagement. Build both seeds in parallel where the volume thresholds support it.

### Retargeting Options

| Option | Details | Best Practice |
|---|---|---|
| **Pixel Segments** | Create a dynamic predictive audience from existing pixel events | Select a conversion event with at least **100 conversions in the last 7 days**. Create the segment and wait for it to populate (segments can be rejected based on algorithmic considerations). |
| **Attentive Audience** | Users who spent significant time on the site but didn't convert. Built automatically from recurring visits and time on site. | Ideal alongside an always-on campaign for lower-funnel objectives (leads, purchases). Use in combination with other retargeting segments to boost reach / scale. |
| **CRM Segments (first-party)** | Upload CRM list to retarget | Upload at least **1,000 user records**. Watch the Reach Estimator — low volume = low spend. **Available in select markets only.** |
| **Search Keyword Retargeting (SRT)** | Segments based on specific search keywords | Reaches high-intent audiences. Can be smaller in scale — combine with other retargeting segments. **Available in select markets only.** |
| **Mail Domain Retargeting (MRT)** | Segments of users who received emails from specific domains | Primary use case: competitor conquesting. **Available in select markets only.** |

---

## Additional Targeting Campaigns

### Options Beyond Run-of-Network

| Targeting Option | Use Case |
|---|---|
| **Contextual and topic targeting** | Target a context-specific audience (financial planning, health / fitness). Create a separate campaign (vs. marketplace segments). Create custom topic segments for niche products. |
| **Optimise for engagement** | Create custom engagement events (time on site, session depth). Relevant for mid-to-lower funnel goals, or engagement KPIs (page views, clicks). |
| **Targeted creative / LP testing** | Include different ad messaging variations and formats (static, motion, carousel). Pair creative messaging with tailored landing pages and monitor performance. |
| **Site targeting** | For advertisers with significant learnings. Use cases: maximise impact for short-burst / seasonal campaigns, or target a curated premium publisher list. |

---

## Guardrails

- Never use more than 5 segments with AND logic — it restricts reach too much.
- Never create a predictive audience from upper-funnel events (page views) — not eligible.
- Never launch MRT or SRT without allowing 24-48 hours for the audience to build.
- Never use pixel retargeting without a minimum of 100 conversions in the seed event.
- Never claim a campaign is "narrowly targeted" without checking the 6-dimension diagnostic in priority order.
- Never recommend a specific audience-targeting product without first confirming it's available in the campaign's market. Several products (MRT, SRT, CRM Segments, CRM Lookalike) are market-limited. Check availability before promising the lever.
- Never apply the objective-based audience strategy table to a non-Tier-1 market without first defaulting to broad targeting. The strategy assumes 1st-party data volume that smaller markets don't have.
- Always start with broad targeting for new campaigns, then refine based on performance.
- Always create a **new campaign** for predictive audience targeting — never add to an existing campaign.
- Always monitor the Reach Estimator to ensure the audience isn't too narrow.
- Always tailor creative messaging to match the specific targeting segment.

### Small-market caveat

Smaller / niche markets (anything outside the Tier 1 list above, plus market-specific small-supply pockets inside Tier 1) have lower scale and a thinner audience pool. The default Tier 1 playbook overshoots there. Specific guardrails for small markets:

- **Restrictive targeting drains the pool fast.** Layered AND-logic targeting, multiple narrow segments, or tight retargeting on a small market will deplete the addressable audience within days and stall campaign delivery. Start broad.
- **Don't limit creatives.** Few creative variants in a small market also limits auction-win rate — the algorithm needs creative variety to compete for the limited impressions available. Ship the full creative set (8-12 variants minimum), not a curated subset.
- **Expect longer learning.** With less reach, the algorithm needs more wall-clock time to accumulate the same number of conversions. Adjust learning-phase expectations and CPA stabilisation timing accordingly.
- **Confirm product availability per market.** MRT, SRT, CRM Lookalike, and CRM Segments are all market-scoped. If the user asks for them in a small market, verify availability before committing.

## Common Mistakes

1. **Too many AND segments.** Audience too small. Max 5 segments with AND logic.
2. **Not waiting for audience build.** MRT / SRT / Predictive targeting empty audiences. Allow 24-48 hours.
3. **Insufficient seed data for Predictive.** Poor audience quality. Need 100+ conversions.
4. **Same messaging for all segments.** Lower relevance, lower CTR. Tailor creatives to each segment.
5. **Expanding everything at once.** Can't isolate what worked. One expansion lever at a time, wait to measure.
6. **Diagnosing narrow targeting from the campaign name or assumption.** The Reach Estimator and the campaign's targeting config are the only valid sources. Read them.

## Pro Tips

- Use the **Audience Toolbox** to find additional audience segments for expansion.
- For **always-on campaigns**, use the Audience Exploration tab to discover untapped segments.
- **MRT is powerful for competitor conquesting** — targeting users who receive emails from competitor brands. One of the most underused targeting features.
- SRT works best with **broad match** for maximum scale. Ensure creative headlines match the search keywords being targeted.
- When expanding targeting for a campaign near audience saturation, consider creating a **parallel campaign** that excludes the top sites — redistributes budget and uncovers new performance pockets.
