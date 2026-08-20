# Realize Best-Practices Gap Analysis

## Purpose

This document serves three jobs, in order of size:

1. **Trace** each recommendation from Taboola's official Realize best-practice articles into the plugin skills/agent — an audit trail showing what we already incorporated.
2. **Correct** any factual inaccuracies that slipped into the skills as the plugin was built; these are the only items that imply future skill edits.
3. **Catalog** everything the best-practice articles recommend that the current Realize MCP (`https://mcp.realize.com/mcp`) does **not** support. These are enumerated as **Potential Future MCP Abilities** — inputs for upstream prioritization, **not** content to be added to the plugin's skills. Skills stay focused on what the MCP actually exposes today; the gap doc carries everything else.

## Sources

### Core articles (primary foundation — already incorporated)
- [Setting Up a New Campaign](https://www.taboola.com/help/en/articles/10473049-setting-up-a-new-campaign)
- [How to Improve Campaign Performance](https://www.taboola.com/help/en/articles/3878108-how-to-improve-campaign-performance)

### Supporting articles (discovered via help-portal link map; consulted for this gap analysis only)
- [Taboola Pixel Overview](https://www.taboola.com/help/en/articles/6248618-taboola-pixel-overview)
- [Defining and Creating Conversions](https://developers.taboola.com/pixel/docs/defining-conversions)
- [Creating and Adding URL Parameters for Tracking](https://developers.taboola.com/pixel/docs/url-params-for-tracking)
- [Retargeting Users Who Have Clicked on Campaign Ads](https://www.taboola.com/help/en/articles/3878045-retargeting-users-who-have-clicked-on-campaign-ads)
- [Campaign Review Process](https://www.taboola.com/help/en/articles/3878200-campaign-review-process)
- [Landing Page Best Practices for Performance Advertisers](https://www.taboola.com/help/en/articles/3878047-landing-page-best-practices-for-performance-advertisers)
- [Title, Thumbnail and Branding Text Policies](https://www.taboola.com/help/en/articles/3878208-title-thumbnail-and-branding-text-policies)
- [Video, Title and Thumbnail Best Practices](https://www.taboola.com/help/en/articles/8964660-video-title-and-thumbnail-best-practices)
- [A/B Testing Campaign Items](https://help.taboola.com/hc/en-us/articles/360063535593-A-B-Testing-Campaign-Items)

### Infrastructure
- Realize UI: [ads.realizeperformance.com](https://ads.realizeperformance.com)
- MCP server: `https://mcp.realize.com/mcp` (`streamable-http`, OAuth 2.1)
- MCP source: [taboola/realize-mcp](https://github.com/taboola/realize-mcp)

## Current MCP capability baseline

This plugin wires **20 read tools + 8 write tools** from the upstream MCP:

| Area | Tools |
|---|---|
| Accounts | `search_accounts` |
| Campaigns | `list_campaigns`, `get_campaign` |
| Items | `list_items`, `get_item` |
| Discovery — targeting | `search_geos`, `search_techno` |
| Discovery — audiences | `search_audiences`, `search_lookalike_audiences`, `search_contextual_segments` |
| Discovery — publishers / conversion | `search_publishers`, `get_conversion_rules` |
| Resources | `list_time_zones`, `list_cta_types` |
| Reports (CSV) | `get_top_campaign_content_report`, `get_campaign_breakdown_report`, `get_campaign_history_report`, `get_campaign_site_day_breakdown_report` |
| Reach estimation | `get_campaign_reach_estimate` |
| Writes — via `manage-campaigns` only | `create_campaign`, `update_campaign`, `create_native_item`, `update_native_item`, `create_display_item`, `update_display_item` |

Write tools are routed exclusively through the `manage-campaigns` skill (preview-then-confirm gate, mandatory `▶ WRITE TARGET` account header). The skill also retains a UI fallback section for capabilities still not exposed by MCP (delete, duplicate, bulk ops, Custom Rules, CRM uploads, lookalike seeds, pixel installation, codeless-conversion setup, pixel test-fire) — see Part 3 for that catalog.

---

## Part 1 — What we took (already in plugin)

### From "Setting Up a New Campaign"

| Best practice | Where it lives |
|---|---|
| Navigation path `Campaigns → +New → Campaign` | `manage-campaigns` UI fallback (delete/duplicate only — create now MCP-backed) |
| Required fields list | `manage-campaigns` "Creating a campaign" — Required fields table |
| Marketing Objective enum (5-value: `BRAND_AWARENESS` / `DRIVE_WEBSITE_TRAFFIC` / `LEADS_GENERATION` / `ONLINE_PURCHASES` / `MOBILE_APP_INSTALL`) | `manage-campaigns` "Creating a campaign" — Marketing Objective enum |
| Bid Strategy enum + budget minimums (10× CPA / 5× CPA daily + 150× monthly / 100–200 clicks/day) | `manage-campaigns` "Creating a campaign" — Bid Strategy × Budget minimums |
| 7–14 day learning phase | `manage-campaigns` Gotchas; `optimize-campaign`; agent Core Responsibility |
| "Stay broad at launch" targeting guidance | `manage-campaigns` "Creating a campaign" — Targeting recommendation |
| 4–6 ads per campaign (never more than 10); "pre-qualify the click"; avoid generic CTAs | `manage-campaigns` "Creating a native item"; cross-referenced in `optimize-campaign` |
| Post-launch MCP verification via `get_campaign` + `list_items` | `manage-campaigns` "Post-write verification" |

### From "How to Improve Campaign Performance"

| Best practice | Where it lives |
|---|---|
| Real-time data review via CSV reports | `reports` (wraps all 4 report tools) |
| Device / Location / Content-type comparisons | `optimize-campaign` Step 3 |
| Daily spend ≥ 8× CPA goal threshold (sourced from realize-toolkit operational guidance, Apr 2026) | `optimize-campaign` Prerequisites + Prescription rules |
| 100+ clicks per item threshold (sourced from realize-toolkit operational guidance, Apr 2026) | `optimize-campaign` Prerequisites + agent responsibility #7 |
| CTR × CVR × CPA prescription rules | `optimize-campaign` Step 2 table |
| Pause low / isolate high / duplicate rules | `optimize-campaign` Prescription rules |
| "Don't just raise the bid to fix CPA" | `optimize-campaign` Gotchas |
| Wait 3–7 days before re-judging a change | `optimize-campaign` Gotchas |
| CPC / budget / targeting / scheduling / traffic-source as levers | `optimize-campaign` Step 4 |

---

## Part 2 — Documentation corrections

Items where existing skill content is **factually inaccurate** against the source article. Not gaps — fixes to apply without any MCP change.

| File | Current wording | Correction | Source |
|---|---|---|---|
| `manage-campaigns/SKILL.md` — review cycle | "24–48 hours" | Target: **"one business day"**; some reviews take longer; no expedited option; contact is `support@taboola.com` or the user's Account Manager | [Campaign Review Process](https://www.taboola.com/help/en/articles/3878200-campaign-review-process) |
| `manage-campaigns/SKILL.md` — review outcomes | Implies binary approved/rejected | Three outcomes: **Fully launched** (all items ready), **Partially launched** (≥1 item running), **Rejected** (none running) | Campaign Review Process |
These two corrections are the only suggested edits to existing skill files. (A third correction — creative variations count — has been applied: skills now align with the toolkit's `3 distinct titles + 3 unique images per campaign` rather than the official A/B testing article's `4–6 titles + similar images per URL`. Toolkit treated as authoritative on this point.) Everything else discovered during this review is cataloged under **Part 3** as a future ability of the MCP, not as skill content.

---

## Part 3 — Potential Future MCP Abilities

Each entry here is a capability called out by the best-practice articles that the plugin **cannot touch today** because the MCP does not expose a relevant tool. These are listed as candidates for upstream ([taboola/realize-mcp](https://github.com/taboola/realize-mcp)) to consider adding. Until they are added, Claude's only path to any of these is to tell the user to do it themselves in the Realize UI — and the plugin's skills should remain silent on the detailed how-to so they don't drift into being a UI manual.

Listed with the source article, a one-line description of what the ability would do, and the UI surface that exists for it today.

### 3.A — Campaign lifecycle writes (create / edit / pause / duplicate)

| Future ability | Does what | Today's UI path | Source |
|---|---|---|---|
| `create_campaign` | Build a new campaign with all required fields (name, branding, objective, scheduling, bid strategy, budget) | `Campaigns → +New → Campaign` | Setup |
| `update_campaign` | Edit any field on a launched campaign (budget, bidding, targeting, scheduling) | Campaign detail → Edit per section | Setup + Optimization |
| `pause_campaign` / `resume_campaign` | Toggle campaign status | Campaign list status toggle, or Pause/Resume button | Optimization |
| `duplicate_campaign` | Clone a campaign with optional field overrides | Row overflow → Duplicate | Editing flow |
| `submit_campaign_for_review` | Programmatic submission | `Continue` button at end of setup | Setup |
| `get_campaign_review_status` | Read the three review outcomes (Fully / Partially / Rejected) and the rejection reason | Campaign list status column | Campaign Review Process |

### 3.B — Campaign item writes (creatives / inventory)

| Future ability | Does what | Today's UI path | Source |
|---|---|---|---|
| `add_campaign_item` | Create an ad with thumbnail, headline, URL, optional CTA/description | Campaign Inventory → +New Item | Setup Step 8 |
| `update_campaign_item` | Edit item fields post-launch | Item form | Setup Step 8 |
| `pause_campaign_item` / `resume_campaign_item` | Toggle single item status (common optimization action) | Campaign Inventory → item toggle | Optimization |
| `upload_asset` | Upload image/video to asset library | Asset library | Setup Step 8 |
| `generate_creative_variations` | Invoke GenAI Ad Maker for automated title/image/motion variants | Campaign Inventory → GenAI Ad Maker | A/B Testing |
| `set_traffic_allocation_mode` | Toggle `EVEN` (formal A/B test) vs. algorithm-biased | Campaign settings | A/B Testing |

### 3.C — Targeting & audience writes

**Closed gaps in this section:**
- ~~`update_blocklist`~~ — **covered** as of upstream Jun 15 2026 ("Add structured support: Block List via MCP" — Chris Hall) via `update_campaign(publisher_targeting={type:"EXCLUDE", value:[<ids>]})`. Read current state with `get_campaign.publisher_targeting`, merge client-side (full-replace within the dimension), preview, write. See `skills/manage-campaigns/SKILL.md` → "Publisher block-list edits — recipe".

| Future ability | Does what | Today's UI path | Source |
|---|---|---|---|
| `update_targeting` | Adjust Location / Platform / Device / Connection / OS / Browser on a campaign | Campaign → Targeting | Setup + Optimization |
| `list_audiences` / `create_audience` | List account audiences or create from pixel/events | `Audiences → New Audience` | Retargeting |
| `attach_audience_to_campaign` | Add `My Audiences` / Taboola First Party Audiences / Contextual or suppression audience to a campaign | Campaign → Audience Targeting | Setup Step 7 |
| `toggle_brand_safety_pre_bid` | Enable/disable the brand-safety filter | Advanced Options | Setup Step 6 |
| `setup_campaign_clicker_retargeting` | The IMG-tag-in-3rd-party-pixels flow that builds an audience from campaign clickers (~2 week build) | `Audiences → New Audience → From Pixel → Campaign Clickers`, then paste IMG tag into the originating campaign | Retargeting article |

### 3.D — Bid & budget writes

| Future ability | Does what | Today's UI path | Source |
|---|---|---|---|
| `update_bid` | Adjust campaign CPC | Campaign → Bidding | Optimization |
| `update_daily_budget` / `update_monthly_budget` | Change budget caps | Campaign → Budget | Both |
| `update_traffic_source_bid` | Per-source CPC overrides | Bidding → source-level | Optimization |

### 3.E — Conversion tracking

This is the single largest capability gap. The plugin cannot advise on conversion-tracking setup because it has no visibility into it; users hitting "my conversion count is zero" cannot be served by the MCP today.

| Future ability | Does what | Today's UI path | Source |
|---|---|---|---|
| `get_pixel_status` | Read pixel health indicator (`Active` / `No Recent Activity` / `No Activity` / `Waiting for Pixel` / `Not Installed`) and last-event timestamp | `Tracking` top bar | [Taboola Pixel Overview](https://www.taboola.com/help/en/articles/6248618-taboola-pixel-overview) |
| `list_conversions` | List URL-based / event-based / codeless conversions defined on the account | `Tracking → Conversions` | [Defining and Creating Conversions](https://developers.taboola.com/pixel/docs/defining-conversions) |
| `create_conversion` | Define a new URL-based or event-based conversion | `Tracking → Conversions → +New Conversion` | Defining Conversions |
| `update_conversion_attribution_windows` | Adjust click-through (1–30 days, default 30) or view-through (1–24 hours, default 24) | Conversion settings | Defining Conversions |
| `toggle_total_conversions_flag` | Control which conversions feed SmartBid / Maximize Conversions — changing this retroactively affects the past 30 days of reports | Conversion form | Defining Conversions |
| `get_conversion_events_report` | Breakdown of conversion events by type (Purchase / Lead / AddToCart / etc.) — distinct from the existing campaign reports | Conversions reporting view | Implied |
| `list_url_parameter_macros` / `apply_tracking_code` | Programmatic management of the 16+ Realize macros (`{campaign_id}`, `{site}`, `{platform}`, `{cachebuster}`, `${GDPR}`, etc.) at campaign-level or per-ad — with the policy that both levels cannot be used simultaneously | Edit campaign → Tracking Code, **or** per-ad → Landing Page URL | [URL Parameters](https://developers.taboola.com/pixel/docs/url-params-for-tracking) |

### 3.F — Review-process visibility

| Future ability | Does what | Today's UI path | Source |
|---|---|---|---|
| `get_review_state` | Pending / Fully launched / Partially launched / Rejected plus per-item breakdown | Campaign list status column | Campaign Review Process |
| `get_rejection_reasons` | Read policy-violation codes on rejected campaigns or items | Rejection notice | Campaign Review Process + linked Rejection Reasons doc |

### 3.G — Cross-window and cohort analytics (read-tool gaps)

Even within the existing read-only surface, there are analytical questions Claude cannot answer without multiple manual calls and post-processing.

**Closed gaps in this section:**
- ~~Site-level blocklist state inspection~~ — **covered** via `get_campaign.publisher_targeting` (upstream returns the field as of the Jun 15 2026 structured-support change). Mandatory read before any block-list write so the merge step has the current state.

| Future ability | Does what | Why it's a gap |
|---|---|---|
| Period-over-period comparison in one call | Return two time windows and deltas | Current reports are single-window; Claude must fetch twice and diff |
| Attribution-window / cohort analytics | Which conversions came from which campaign cohort, over what lag | Not exposed by any tool |
| Audience / segment performance breakdown | Performance per audience attached to a campaign | Not exposed |
| Scheduling state inspection | Read dayparting / 24-7 / custom-hours config on a campaign | Unconfirmed against upstream docs |
| Targeting state inspection | Read Location / Platform / Device / Audience state on a campaign | Unconfirmed against upstream docs |

### 3.H — Landing-page quality signals (structural gap)

The Landing Page Best Practices article is largely infographic-based and thin on crawlable text. Even if the MCP were to expose tooling, this is unlikely to be automatable — it's a human content-quality call. Flagging as a structural gap the MCP probably should not try to fill.

---

## Part 4 — How this document evolves

### When a Part 3 ability is added upstream

1. Record the new tool in the agent's Tool Reference (`agents/realize-analyst.md`).
2. Route it into the most appropriate skill (or create a new skill if the capability is its own concern — e.g., a new `conversion-tracking` skill would be the natural home if `get_pixel_status` and `list_conversions` land together).
3. Move the row out of Part 3 and into Part 1 ("What we took"), noting the release that added it.
4. Add a scenario to `tests/test-scenarios-read.md` (read-only paths) or `tests/test-scenarios-write.md` (destructive paths) exercising the new path.
5. Open a dedicated PR — never silently add a write path.

### When a Part 2 correction is applied

Simple: edit the cited skill file(s) with the corrected wording, remove the row from Part 2, and commit with a reference to the source article.

### When upstream help articles change

The source articles referenced here are a point-in-time snapshot. Periodically re-fetch the core and supporting articles to detect new recommendations, new enum values, or retired features. Any new official guidance feeds into this document first; the skills stay focused on MCP-supported workflows.
