# Campaign Structure

## Overview

Campaign structure determines how budgets are distributed, how the algorithm optimises, and how reporting is organised. Correct structure prevents budget cannibalisation, simplifies optimisation, and makes performance analysis actionable. This file covers Campaign Groups, objectives, campaign types, scheduling, and how to compare structural choices across periods of different total budget.

---

## Campaign Groups

> **MCP support status (updated 2026-10-13).** Reading groups **is** exposed: `get_campaign_groups` returns a group's objective, KPI, conversion rules, budget, flight dates and status. A campaign's `campaign_group_id` (from `get_campaign` / `list_campaigns`) is the way in — read the group **by that id**; see *Reading a campaign group* below for the one procedure.
>
> **Group creation and editing are wired** (`create_campaign_group`, `update_campaign_group`), through the `manage-campaigns` preview-then-confirm gate like every other write. They are account-shaped: a group write reaches **every campaign in the group** — switching how the budget is split takes budget control away from each of them, and a shared group's budget change reaches all of them, and `is_active=false` pauses them all — so the preview has to say what will be affected, not just which fields change. There is no delete: deleting a group terminates its campaigns, and the supported retirement is `is_active=false`.
>
> **Putting a campaign into a group IS wired** — `create_campaign` and `update_campaign` both take `campaign_group_id` (pass the id as a string), and both go through the `manage-campaigns` write gate. Two upstream limits matter:
> - On `create_campaign` it places the new campaign in the group. The campaign's dates must fall inside the group's, and omitted dates take the group's.
> - On `update_campaign` it can only **attach a campaign that is in no group yet**, and only to a group whose `budget_distribution_method` is `CUSTOM`. **Moving a campaign to a different group, or taking it out of one, is not possible through the MCP at all** — that is the genuinely UI-only part.
>
> **In an `AUTOMATIC` group the group owns the budget.** `budget_distribution_method` has exactly two values: `CUSTOM` (the default — each campaign keeps its own budget) and `AUTOMATIC` (Taboola allocates the group's budget across its campaigns). In an `AUTOMATIC` group the campaign's `spending_limit`, `spending_limit_model`, `daily_cap` and `daily_ad_delivery_model` are read-only — the API rejects them — so read the group before prescribing a budget change on one of its campaigns, per *Reading a campaign group* below — by id, which returns the budget fields. If `budget_distribution_method` is still absent after a by-id read, do **not** infer `CUSTOM`: say the group's budget setup could not be confirmed. `MAX_CONVERSIONS` is the **recommended** bid strategy for an `AUTOMATIC` group's campaigns, not a requirement — never refuse a write over it. (Upstream retired the older `FULLY_SHARED` / `CPA_BASED_ALLOCATION` / `OPTIMIZE_SCALE` / `OPTIMIZE_PERFORMANCE` names on 2026-10-12; anything still using them is stale.)

### The group sets the conversion goal for campaigns that don't set their own

> **A group's conversion rules are the group's *selection*, not a statement about its campaigns.** Any member campaign may carry its own, which replaces the group's for that campaign and is not visible in Realize. So never report a group's conversions as what its campaigns optimize toward — describe them as what the group selects, and resolve the goal per campaign when the question is about a campaign. This matters most on duplicated campaigns, which bring the original's goal with them into the group.

This is the part that changes answers, not just planning. A campaign's conversion goal resolves in this order:

1. **The campaign's own `conversion_rules`** — if it has any at all, they win, active or not (see below). They **replace** the group's for that campaign; they are not added to them.
   **A campaign-level goal wins even when it is stale — that is the failure mode, not an exception.** `conversion_rules.rules` carries only `{id}`, nothing about the rule behind it. A campaign can be attached to a rule that is disabled, archived, or simply receiving nothing, and it still optimizes toward that rule; the group's goal does **not** take over. Many of these attachments arrive by duplication — a campaign copied from a pre-group original brings its old goal with it. So resolve every id with `get_conversion_rules(account_id, rule_id="<the id>")` — **by id, with no `status` filter**. Do not match on `display_name`, and do not reach for the ACTIVE-by-default listing: a retired rule is absent from it, so the rule you are checking is exactly the one that read would hide. Then: name the rule as the goal, and if it is not `ACTIVE`, say in the same breath that the campaign is optimizing toward a retired rule. Never silently fall through to the group, and never report the group's goal instead — a campaign spending against a dead goal is exactly what the reader needs told.
2. **Its group's `conversion_rules`** — read the group by the id in the campaign's `campaign_group_id`, per *Reading a campaign group* below. A group's rules apply to every campaign in it that has none of its own. **Read it by following *Reading a campaign group* below** — by id, the matching row on the rare occasion you do have to list, and what an unread result means. Do not improvise the call here.
3. **The account default** — the account's ACTIVE rules marked `include_in_total_conversions`, used only when neither of the above is set. Note that a group can be on the account default **deliberately** — it is a valid setting, not only a gap — so "the group sets none" and "the group was never configured" are not the same statement. Say which level the goal resolved at; don't editorialise about whether someone meant it.

Read the field carefully: `conversion_rules` comes back as an object, `{"rules": [...]}`. The inherit case is **`rules` being an empty array**, not the field being absent — the object is normally there and is always truthy when it is. An empty `rules` on a campaign therefore does **not** mean "account default". Check the group before saying so. Anything else — the key absent, or `null` — means **unread**, not "no goal": say the campaign's own rules could not be read rather than resolving past them. **If the group reads back `STOPPED`, it has been deleted — and deleting a group terminates its campaigns.** Say that, rather than reporting a conversion goal for a campaign that is no longer running. A campaign can sit in a group with a specific goal while the account default is something else entirely, and reporting the account default there is a wrong-KPI answer.

**A campaign in a group can still carry its own conversion goal, and as of 2026-10-13 the Realize UI does not surface that field on a grouped campaign**. Those rules are the ones in effect, active or not, and nothing here replaces them with the group's. So when the goal you report came from the campaign itself **and the campaign is in a group**, add one line saying the Realize UI may show the group's goal instead; otherwise a user who checks the screen will read a correct answer as a mistake.

### Reading a campaign group

Every instruction elsewhere that says "read the group" means this procedure. It is written once, here.

```
get_campaign_groups(account_id="<the campaign's owning advertiser>", campaign_group_id="<the group id>")
```

1. **Read by id whenever you have the id.** That is what the three tool descriptions tell you to do, and the single-group read returns the full record — objective, KPI, dates, budget method, and `conversion_rules`. Pass the id as a string even though `get_campaign` hands it back as a number.
2. **The list form is for finding a group you cannot name by id** — `search_text` matches the group's name. Do not use it to re-read a group you already have the id for: verified against production on 2026-10-14, the same group returns `conversion_rules: {"rules": []}` by id and `conversion_rules: null` through the listing. Rule 4 below turns that `null` into "unread", so the listing would make a readable group look unreadable.
3. **When you do list, pick the row whose `id` matches.** `search_text` matches names as well as ids and results sort by id ascending, so the row you want is often not the first. If no row on the page matches, page on before concluding anything.
4. **`conversion_rules` has three states.** A non-empty `rules` array is the group's own goal; an empty array means it sets none; anything else — the key absent, or `null` — means **unread**. Say the group could not be read rather than resolving past it to the account default.
5. **Never pass `statuses` when you are resolving a specific group.** It silently drops any group not in the statuses you asked for, including the one you are looking for, and the result is indistinguishable from the group not existing. Filtering a browse-the-account listing is fine — `["RUNNING"]` for live groups, and **never `ACTIVE`**, which is rejected outright rather than ignored.
6. **`account_id` is the advertiser that owns the group**, not a NETWORK or parent account its campaigns were listed through.
7. **"Has a group" means `campaign_group_id` is a positive number.** `0`, `null`, `""` and an absent key all mean ungrouped, and none of them is an id worth reading.
8. **The group's CPA numbers are not the campaign's bid target.** A group carries its own `marketing_objective`, `kpi`, and optionally `kpi_data` — a pair of CPA thresholds feeding Realize's recommendations, and only when the group's `kpi` is CPA and both are set. Never report them as a Target CPA.

A `STOPPED` group has been deleted, and deleting a group terminates its campaigns — say that rather than reporting a goal for a campaign that is no longer running.

### What Campaign Groups Do

A **Campaign Group** is a layer between the account and campaigns:

- **Campaign Group** = the "What" (the objective and KPI).
- **Campaign** = the "How" (tactics — targeting, platforms, creative formats, supply type).

| Feature | What It Does |
|---|---|
| **Budget Distributor** | Automatically allocates daily / total budget across campaigns in the group. |
| **Unified Reporting** | Aggregates performance across all campaigns in the group. |
| **Flight Dates** | Sets start / end dates that apply to all campaigns in the group. |

### Grouping Rules

- All campaigns within a Campaign Group must optimise toward the **same** marketing objective and KPI.
- For every different marketing objective and KPI, create a separate Campaign Group.
- Never mix campaigns with different objectives under the same Campaign Group.
- There is no limit to the number of campaigns you can create under a Campaign Group.

### When to Create Separate Campaigns Within a Group

Campaigns within a group should vary by optimisation tactic:

- Audience targeting (broad, contextual)
- Platform targeting (mobile, desktop)
- Creative formats (display, carousel, Sponsored Content)
- Supply type (Mail, Apple News)
- Bidding strategy
- Creative messaging angles

### Campaign type (Native vs Display) is locked at creation

A campaign's type (Native / Sponsored Content vs Display) is set when the campaign is created and CANNOT be changed afterward. There is no Native↔Display toggle in `update_campaign` or in the Realize UI. To switch types you must create a NEW campaign.

The Realize MCP **does support creating both Native and Display campaigns** end-to-end. The `create_campaign` tool does not expose a separate `campaign_type` field — instead, the type is derived in one of two ways:

1. **`pricing_model=VCPM` → Display, locked at create time.** VCPM is supported only on Display in Realize. Native cannot price on VCPM — the server rejects any Native item attached to a VCPM campaign. So a VCPM campaign is Display from the moment `create_campaign` returns, before any item is attached.
2. **`pricing_model=CPC` → type is undetermined at create, locked by the first item attached.** On CPC campaigns the campaign initially reports `campaign_item_type: HAS_NO_ITEMS`, and the first `create_display_item` call locks the campaign as Display, while the first `create_native_item` call locks it as Native.

`campaign_profile.ad_type: PUBLISHER` is a default UI stamp on item-less campaign shells and is NOT the lock-in campaign type — do not confuse the two. The campaign's actual type is fixed at create time by the pricing model (VCPM) or by the first item-creation call (CPC). See `creative.md` for the full Display recipe.

### Platform / device splits — default to splitting, not bundling

Combining Desktop + Mobile + Tablet under a single campaign is a common mistake. Performance differs significantly across platforms (CPC, CVR, viewability, creative behaviour), and the Realize algorithm cannot optimise as effectively when traffic is mixed. Reporting also becomes harder to read.

**Default rule:** when the campaign is intended to run on multiple platforms (or the platform mix is unrestricted), produce ONE campaign per platform group. Acceptable groupings:

| Grouping | Use when |
|---|---|
| `DESK` alone | Always split desktop from mobile. Different bid markets, different creative best-practice. |
| `PHON + TBLT` together | Mobile-first builds where tablet is a small share. Acceptable compromise. |
| `PHON` alone, `TBLT` alone | When the campaign requires different creative or KPIs per device. |
| `DESK + PHON + TBLT` ALL in one campaign | ONLY when a unified buy is explicitly required, or when splitting would drop each platform below the algo's learning threshold (see per-day rule below). |

When budget per campaign would fall below the algo's learning threshold after splitting (Realize rule of thumb: **< $1k/day for `MAX_CONVERSIONS` / `TARGET_CPA`, < $500/day for `FIXED`**), bundle platforms and note the reason for bundling. Use the per-day, strategy-specific threshold — don't substitute a flat total-budget figure.

### Budget Distributor Behaviour

The Budget Distributor is the group's automatic allocation — `budget_distribution_method: AUTOMATIC`, the one alternative to `CUSTOM`. **There is one automatic mode, not two**: upstream retired the separate scale-led and CPA-led methods on 2026-10-12 and describes the surviving one as allocating the group's budget *for the best performance*. **No read tool reports how an account's allocation actually behaves**, so describe the current mode and do not promise a specific allocation outcome. The one bullet below is the older scale-led description, kept only because it is still quoted:

- *Realize+ Phase 1, superseded — do not state as current:* a narrow-targeting campaign with great performance may be limited in scale, so the Budget Distributor prioritises broader-targeted campaigns to ensure budget depletion.

**Key requirements when using the Budget Distributor:**

- `MAX_CONVERSIONS` is the **recommended** bid strategy for the campaigns in an `AUTOMATIC` group — upstream's recommendation, not an API rule. Never refuse or rewrite a campaign write over it.
- Prefer the **same bidding strategy** across the group's campaigns, so the allocator compares like with like. It is guidance, not an API rule — never block a write on it.
- Prefer the **same conversion goal** across the group's campaigns, for the same reason. A campaign may still carry its own goal, which *replaces* the group's for that campaign — see the goal-resolution section above.

### Realize+ beta context

The Budget Distributor described above is **Phase 1 of the Realize+ beta** — Realize's first AI-augmented optimisation surface. When referring to Realize+:

- **Realize+ today (Phase 1):** an optimised budget allocator that sits on top of Campaign Groups. The current public version is what's described in this file.
- **Realize+ Phase 2 (Q3 2026):** adds additional agentic optimisation surfaces beyond budget allocation. Frame as roadmap, not as live.

Plain-language summary: *"Realize+ is in the first stage of beta — currently an optimised budget allocator inside Campaign Groups. Phase 2 lands in Q3 2026 with additional agentic optimisation capabilities."*

### Decision Table

| Scenario | Use Group? | Why |
|---|---|---|
| Big budget, long engagement period | Yes, multiple campaigns | Try multiple strategies / optimisation tactics. |
| Tight budget, ROAS goal | Yes, but start limited | Open up once you prove performance. |
| Different marketing objectives | No — separate groups | Each objective needs independent optimisation. |
| Single campaign | No | No benefit to grouping. |

---

## Campaign Objectives

### The 5 Objectives

Choosing the right marketing objective is critical — it determines how the algorithm learns and optimises.

| Objective | When to Use | Best Suited For |
|---|---|---|
| **Lead Generation** | Advertiser wants to drive leads through email sign-ups, form fills, or demo requests | Advertisers with a long-tail funnel, possibly with an offline conversion event. |
| **Online Purchases** | Advertiser wants to drive purchases for a product / service | E-commerce or D2C advertisers selling a specific product. |
| **Website Engagement** | Advertiser wants to increase page views, clicks, or time spent on site | Driving qualified traffic or creating warm audiences for further funnel targeting. |
| **Brand Awareness** | Advertiser wants to increase visibility and recall | New brands or product-launch information. |
| **App Installs** | Advertiser wants to drive mobile app installs | App-first brands or brands expanding mobile app usage. |

### Objective Selection Decision Rules

| Advertiser Goal | Correct Objective | Common Mistake |
|---|---|---|
| "I want sales" | Online Purchases | Setting Lead Generation (wrong optimisation target). |
| "I want leads / sign-ups" | Lead Generation | Setting Website Engagement (optimises for traffic, not leads). |
| "I want app downloads" | App Installs | Setting Lead Generation (different tracking / attribution). |
| "I want people to know my brand" | Brand Awareness | Setting Website Engagement (similar but different optimisation). |
| "I want traffic to my blog" | Website Engagement | Setting Lead Generation (no conversion to optimise for). |

- Never change the objective after campaign launch — this resets the algorithm completely.
- If the objective was set wrong, create a new campaign with the correct objective.

---

## Campaign Types

### Sponsored Content (Native) vs. Display

| Dimension | Display Ads | Sponsored Content |
|---|---|---|
| **Format** | Traditional banner ads, standard IAB sizes. Entire message conveyed within the ad itself, without headline / description. | Static images, motion ads, carousels. Always include headline, description, and CTA within the card. |
| **Placement** | Dedicated ad spaces around content (banner positions). | Within the content feed or editorial environment. |
| **Intent** | Effective for intent prospecting, boosting engagement, and building high-value audiences. | Closely aligned with user intent, effective at driving lower-funnel conversions. |
| **Performance** | Higher-impact, engagement-oriented campaigns. Standard IAB sizes for maximum scale. Optimised for visibility and reach. | Key driver at every stage of the funnel, especially lower-funnel. Seamless integration with content. |

### Campaign Type Decision Matrix

| Scenario | Type | Why |
|---|---|---|
| First campaign on Realize | Sponsored Content (Native) | Higher engagement, better for learning phase, key driver for lower-funnel. |
| Scaling after Sponsored Content success | Add Display campaign | Incremental reach on new placements, non-feed environments. |
| Advertiser has mid-funnel KPIs | Display or mix | Display is effective for engagement and audience building. |
| Advertiser has lower-funnel KPIs | Sponsored Content | Excels at driving conversions. |
| Advertiser has display assets only | Display | Use what exists; plan Sponsored Content creative development. |
| Advertiser has both asset types | Separate Sponsored Content + Display campaigns | Never combine — they need independent optimisation. |

- Always create separate campaigns for Sponsored Content (Native) and Display — never mix in one campaign.

---

## Scheduling

### When to Use Scheduling

| Scenario | Recommendation |
|---|---|
| One-time campaigns (e.g., Black Friday sale, product launch) | Specify start / end date (defaults to immediate start once approved). |
| Always-on campaigns | No end date. Review monthly. |
| Clear historical performance data for specific days / times | Apply dayparting to set ads for those days / times. |
| No historical data | Do not apply dayparting — start 24/7. |

- Only use dayparting when there is clear historical performance data showing consistent preference for specific days or times.
- Never apply scheduling restrictions at launch without data.

---

## Campaign Hierarchy

```
Account
└── Campaign Group (the "What" — objective + KPI)
    └── Campaign (the "How" — tactics)
        └── Ads (items)
```

- Realize uses Campaign Groups; there is no sub-layer beneath them.
- All ads in a campaign share the same targeting, bidding, and budget settings.
- To test different targeting or bidding, create separate campaigns.

---

## Comparing Structure Choices Across Periods — % Share, Not Absolute $

When comparing how campaign structure choices played out across two or more periods (weeks, months) where the **total budget / spend differs**, compare in **% share of total period spend**, not absolute dollars.

- **Primary number:** % share of total period spend.
- **Secondary number:** absolute $ alongside the % share.
- **Δ row:** in **percentage points (pp)**, not relative %. "Mail dropped from 22% → 14% (Δ −8 pp)" — never "Mail dropped 36%."

### Why this matters for structure analysis

Period A had $20k total spend, period B had $30k total spend. The structure split:

| Group / Campaign | Period A spend | Period B spend |
|---|---|---|
| Mail-only group | $4,400 | $4,200 |
| Open-web group | $3,000 | $9,000 |

Absolute view says "Mail is stable." % share view tells the real story:

| Group / Campaign | Period A share | Period B share | Δ pp |
|---|---|---|---|
| Mail-only group | 22% | 14% | **−8 pp** |
| Open-web group | 15% | 30% | **+15 pp** |

Mail meaningfully **lost share** even though absolute $ looks flat. Open web tripled its share.

### When the rule applies to structure analysis

- Comparing campaign group splits across weeks / months
- Comparing Sponsored Content vs. Display split across periods of different total budget
- Comparing per-environment (Mail / Apple News / Lockscreen) shares
- A / B-style structural experiments where arms have different budgets

### When absolute $ leads instead

- YoY explicitly framed as "did we grow the account in absolute terms?"
- Single-campaign spend trended over time
- Forecasting / planning total budget for next period

---

## Guardrails

- Never change the campaign objective after launch — create a new campaign instead.
- Never combine Sponsored Content (Native) and Display in one campaign.
- Never mix campaigns with different objectives under the same Campaign Group.
- Never compare structural choices across periods using absolute $ when totals differ — use % share + Δ pp.
- Always set all campaigns in a group to the same bidding strategy when using the Budget Distributor.
- Always ensure conversion goals are the same across all campaigns in a group.
- Always use separate campaigns for separate optimisation tactics (different targeting, different bid strategies, different supply types).

## Common Mistakes

1. **Wrong objective selected.** Algorithm optimises for the wrong action. Create a new campaign with the correct objective.
2. **Mixing objectives in one Campaign Group.** Budget Distributor can't optimise. Separate groups per objective / KPI.
3. **Mixing Sponsored Content + Display.** Algorithm can't optimise across format types. Separate campaigns.
4. **Different bidding strategies in one group.** Budget Distributor conflicts. Use the same bidding strategy across the group.
5. **Different conversion goals in one group.** Confusing optimisation signals. Align conversion goals across all campaigns in the group.
6. **Comparing structure splits across periods of different total spend in absolute $.** Hides the share story. Use % share + Δ pp as headline.

## Pro Tips

- Campaign Groups with the Budget Distributor are powerful for advertisers testing multiple tactics — remember upstream now describes the automatic mode as allocating **for best performance**. Earlier Realize+ Phase-1 material described it allocating for reach / scale — recorded here because it is still quoted, but superseded. No read tool reports which model an account is on, so describe the current one and do not promise a specific allocation behaviour.
- When an advertiser wants to "restart" a poorly performing campaign, it is often better to create a fresh campaign. Building a new campaign resets the learning phase and removes historical constraints. Pair it with fresh creatives, new segments, or re-evaluated bidding strategies.
- Always optimise toward a specific product or funnel per account. Do not mix different products and completely different funnels on the same account.
