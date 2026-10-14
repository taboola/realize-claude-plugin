# MCP Write-Surface Reference

> Loaded by `skills/manage-campaigns/SKILL.md` when a payload needs detailed field coverage. The SKILL.md carries the workflow (8 steps, two-gate activation, pre-write self-eval, forbidden patterns); this file carries the per-tool field reference.

---

## 1. `create_campaign` — full scalar list

Required fields on every create call:

| Field | Type | Notes |
|---|---|---|
| `account_id` | string | The opaque account identifier from `search_accounts` — NOT the numeric `id`. Pass through verbatim; don't reformat. |
| `name` | string | Internal campaign name. See `knowledge/campaign-structure.md` for grouping + objective rules; no platform-imposed naming convention. |
| `marketing_objective` | enum | One of: `BRAND_AWARENESS`, `DRIVE_WEBSITE_TRAFFIC`, `LEADS_GENERATION`, `ONLINE_PURCHASES`, `MOBILE_APP_INSTALL`. Locked at create — cannot be changed via `update_campaign`. |
| `branding_text` | string | Shown publicly under each item. Use the brand name or product line. |
| `spending_limit_model` | enum | One of `NONE`, `MONTHLY`, `ENTIRE`. Use `NONE` + `daily_cap` + `daily_ad_delivery_model="STRICT"` for a daily cap. Use `MONTHLY` or `ENTIRE` + `spending_limit` for monthly cap / lifetime (flight total). **Required only when `campaign_group_id` is absent.** With a group set it becomes optional in a `CUSTOM` group (send it if the campaign should keep its own budget) and must be **omitted entirely** in an `AUTOMATIC` one. |
| `bid_strategy` | enum | One of: `MAX_CONVERSIONS`, `TARGET_CPA`, `MAX_VALUE`, `SMART` (= Enhanced CPC in UI), `FIXED`. See Section 4 for the per-strategy field-gate matrix. |

Optional but commonly-set scalars:

| Field | Type | Used for |
|---|---|---|
| `spending_limit` | currency | The cap amount. Required when `spending_limit_model=MONTHLY` (monthly cap) or `spending_limit_model=ENTIRE` (lifetime / flight total). For daily-only caps, use `spending_limit_model="NONE"` plus `daily_cap` instead — see the Maximize Conversions example below. |
| `daily_cap` | currency | Daily spend ceiling. Pairs with `spending_limit_model="NONE"` + `daily_ad_delivery_model="STRICT"`. |
| `cpc` | currency | Bid. **Valid only on `bid_strategy=SMART` (Enhanced CPC) or `bid_strategy=FIXED`.** Reject the payload on `TARGET_CPA` / `MAX_CONVERSIONS` / `MAX_VALUE`. |
| `cpa_goal` | currency | Target CPA. **ONLY valid when `bid_strategy=TARGET_CPA`.** Reject otherwise. |
| `cpc_cap` | currency | Optional ceiling on per-click cost. **Valid only on `bid_strategy=MAX_CONVERSIONS`** (last-resort lever; sending it on `TARGET_CPA` / `MAX_VALUE` / `SMART` / `FIXED` returns API 400). See `knowledge/bidding.md` "Bid Ceiling for Maximize Conversions". |
| `roasGoal` (NOT writable via MCP) | number | Target ROAS multiple for `MAX_VALUE`. **Update-only**, **DCO accounts only**, and **not currently exposed by the MCP** — cannot be set on `create_campaign` or `update_campaign`. Set in the Realize UI after creation. |
| `start_date`, `end_date` | ISO date | Flight dates. Optional `end_date` means always-on. |
| `tracking_code` | string | UTM scheme / tracking parameters appended to outbound URLs. |
| `comments` | string | Internal notes — link to source plan / ticket. |
| `daily_ad_delivery_model` | enum | `BALANCED` (default — smooths spend across the day; forbids `daily_cap`) / `STRICT` (tight daily pacing; **required when `daily_cap` is set**). Matches `skills/manage-campaigns/SKILL.md`. |
| `traffic_allocation_mode` | enum | Defaults to algorithm-driven. |
| `pricing_model` | enum | `CPC` (standard) or `VCPM` (Display only — locks campaign as Display at create time). See `knowledge/creative.md` for the two-path Native-vs-Display lock-in rule. |
| `is_active` | boolean | **Always `false` on initial create.** Flipped to `true` only after the activation gate (see *Create-with-launch flow* in SKILL.md). |
| `campaign_group_id` | string | Places the new campaign in that group — id from `get_campaign_groups`, sent as a string even though `get_campaign` returns it as a number. **Read the group first:** its dates bound the campaign's (omitted dates take the group's), and how its budget is split decides whether you may send budget fields at all — see the next section. With `campaign_group_id` set, `spending_limit_model` stops being required. |

### Campaign groups and the budget they own

A group's `budget_distribution_method` decides who owns the budget, and getting it wrong is a rejected call, not a warning. Read the group before any create-into-group or budget change on a campaign in one.

| `budget_distribution_method` | What it means | What the campaign may send |
|---|---|---|
| `CUSTOM` (the default) | Manual — each campaign keeps its own budget; nothing is auto-allocated. | Its own `spending_limit_model` / `spending_limit` / `daily_cap` / `daily_ad_delivery_model`, as normal. Also the only kind of group `update_campaign` can attach a campaign to. |
| `AUTOMATIC` | Taboola allocates the group's budget across its campaigns. The group needs a limited budget, so a group-level `spending_limit_model` of `NONE` is rejected. | **None of those four fields** — the group owns them and the API rejects them. `MAX_CONVERSIONS` is the **recommended** `bid_strategy` here, not a requirement: do not refuse a write because the campaign uses another strategy. |

**Read the group per `knowledge/campaign-structure.md` → *Reading a campaign group*** — by id, which returns the budget fields. If `budget_distribution_method` is still absent afterwards, do **not** infer `CUSTOM`: say the group's budget setup could not be confirmed, and do not preview a campaign budget write.

**There are exactly two values, and they read back the way they are written.** Upstream retired the older `FULLY_SHARED` / `CPA_BASED_ALLOCATION` reads and their `OPTIMIZE_SCALE` / `OPTIMIZE_PERFORMANCE` write spellings on 2026-10-12; a doc or a cached answer still naming any of those four is stale. Setting this field belongs to the campaign-group write tools — §3c below, through the same preview-then-confirm gate. Don't surface the raw value to the user either; `os/guardrails.md` has the plain-English phrasing.

So *"raise the daily budget on campaign 12345"* is not always a campaign-level write: if 12345 sits in an `AUTOMATIC` group, the budget lives on the group, so the write is `update_campaign_group` (§3c), not `update_campaign` — which would be rejected. Say where the budget actually lives, and that changing it there reaches every campaign in the group, before previewing anything.

**Attach is not move.** On `update_campaign`, `campaign_group_id` can only attach a campaign that is currently in **no** group, and only to a `CUSTOM`-budget group. Moving a campaign between groups, or removing it from one, has no MCP tool — that is a UI action. Never present an attach preview for a campaign that already has a `campaign_group_id`.

## 2. Targeting blocks on `create_campaign`

All optional; populate where the request specifies. Item-level targeting does not exist — all targeting is set here.

### Geo

**Country-level (`country_targeting`) is independent.** Among the sub-country dimensions (`region_country_targeting`, `dma_country_targeting`, `city_targeting`, `postal_code_targeting`), pick **at most one** per campaign — mutex applies within that group only. A campaign can have `country_targeting` AND one sub-country dimension simultaneously (e.g., country=US + city=[NYC, LA]); it cannot have two sub-country dimensions at once (e.g., region + city).

| Field | Shape | Resolver |
|---|---|---|
| `country_targeting` | `{type: INCLUDE|EXCLUDE|ALL, value: [ISO-2 codes]}` | `search_geos(dimension=countries)` |
| `region_country_targeting` | `{type: INCLUDE|EXCLUDE|ALL, value: [region IDs]}` | `search_geos(dimension=regions)` |
| `dma_country_targeting` | `{type: INCLUDE|EXCLUDE|ALL, value: [DMA codes]}` | `search_geos(dimension=dmas)` |
| `city_targeting` | `{type: INCLUDE|EXCLUDE|ALL, value: [city IDs]}` | `search_geos(dimension=cities)` |
| `postal_code_targeting` | `{type: INCLUDE|EXCLUDE|ALL, value: [postal codes]}` | `search_geos(dimension=postal_codes)` |

### Platform / device

| Field | Shape | Notes |
|---|---|---|
| `platform_targeting` | `{type: INCLUDE|EXCLUDE|ALL, value: [DESK|PHON|TBLT|TV|OTHR|NA]}` | Default per `knowledge/campaign-structure.md` — split by platform group when budget allows. |
| `os_targeting` | `{type, value: [OS names]}` | `search_techno(dimension=operating_systems)` |
| `browser_targeting` | `{type, value: [browser names]}` | `search_techno(dimension=browsers)` |
| `connection_type_targeting` | `{type, value: [WIFI|CELLULAR|...]}` | `search_techno(dimension=connection_types)` |

### Audience

| Field | Shape | Resolver |
|---|---|---|
| `audiences_targeting` | `{state: INCLUDE|EXCLUDE, value: [{type, value: [int IDs]}]}` | `search_audiences` (account-resident, e.g. pixel-built segments, CRM uploads) |
| `contextual_segments_targeting` | `{state, value: [{type, value: [int IDs]}]}` | `search_contextual_segments` (network-wide marketplace catalogue — demographics, interests, 3P data partners) |
| `lookalike_audience_targeting` | `{state, value: [{type: INCLUDE, value: [{rule_id, similarity_level}]}]}` | `search_lookalike_audiences` (account-resident lookalike seeds) |

### Supply / placement

| Field | Shape | Notes |
|---|---|---|
| `publisher_targeting` | `{type: INCLUDE|EXCLUDE|ALL, value: ["<publisher_id_string>", ...]}` | **Values are strings** — feed the IDs returned by `search_publishers` verbatim; the MCP validator rejects integers. Run the historical-top-N guard in `knowledge/site-management.md` before any EXCLUDE. |
| `publisher_bid_modifier` | `{"values": [{"target": "<publisher_name>", "cpc_modification": <multiplier>}]}` (publisher **name** string, not ID; `cpc_modification` is a multiplier — `1.20` = +20%, `0.90` = −10%) | **ONLY valid on `SMART` (Enhanced CPC) or `FIXED`.** Reject on Maximize Conversions / Target CPA / Maximize Value. |
| `predefined_premium_site_targeting` | enum | `ALL` / `PREMIUM` / `REGULAR`. Confirm account permission before setting. |

### Conversion + dayparting

| Field | Shape | Notes |
|---|---|---|
| `conversion_rules` | `{"rules": [{"id": <integer_rule_id>}, ...]}` (object containing a `rules` list; key is `id` and value is an **integer**, not `rule_id` / string) | Use `get_conversion_rules` to resolve, or `create_conversion_rule` to make one. Required for performance objectives (ONLINE_PURCHASES / LEADS_GENERATION / MOBILE_APP_INSTALL) — see `knowledge/bidding.md` "When the conversion rule isn't ready yet" for the placeholder-rule recipe. Note the type split: the rule `id` is an **integer** here, but `update_conversion_rule`'s own `rule_id` parameter is that same id **as a string**. |
| `activity_schedule` | `{time_zone, days: [{day, hours}]}` | Dayparting. `time_zone` resolved via `list_time_zones`. Don't apply at launch without data (per `knowledge/campaign-structure.md`). |

## 3. Item-level write tools

### `create_native_item` — Sponsored Content / Native

| Field | Type | Notes |
|---|---|---|
| `account_id`, `campaign_id` | string | Both required. |
| `url` | string | Landing-page URL. Required. |
| `title` | string | 60 characters, front-loaded value proposition. Either supply `title` + `description` + `thumbnail_url` together, OR omit all three to trigger server-side crawl. |
| `description` | string | Optional sub-headline. Same all-or-none rule with title + thumbnail. |
| `thumbnail_url` | string | Image URL. Same all-or-none rule. |
| `cta` | `{cta_type}` | Optional. `cta_type` resolved via `list_cta_types`. |
| `creative_name` | string | Always set — this is what the user sees in the UI. |
| `is_active` | boolean | **Always `false` on initial create.** |

### `create_display_item` — Display (1P-hosted or 3P JS tag)

| Field | Type | Notes |
|---|---|---|
| `account_id`, `campaign_id` | string | Both required. |
| `url` | string | Landing-page URL. Required. |
| `ad_tag` | string | Required for 3P JS tags. Raw HTML/JS string — must pass the per-vendor validator server-side. **No `<!DOCTYPE>`, no `<html>`, no `<body>` / `<div>` wrapper, no leading whitespace.** First character must be `<`. |
| `asset_url` | string | Required for 1P-hosted display (uploaded image / motion file). Mutually exclusive with `ad_tag`. |
| `thumbnail_url` | string | Required for 1P-hosted display. Do NOT supply for 3P JS tags — the tag IS the creative. |
| `dimensions` | `[{width, height}]` | Single-entry array. Standard IAB sizes: 300×250, 300×600, 320×50, 728×90, 970×250, 160×600, 720×1280. |
| `creative_name` | string | Always set. |
| `verification_pixel` | string | DV / IAS verification pixel — optional third-party tag. |
| `viewability_tag` | string | DV / IAS viewability tag — optional. |
| `is_active` | boolean | **Always `false` on initial create.** |

### `update_native_item` / `update_display_item`

Same field shapes as the create tools. Use to:

- **Pause an item:** `update_*_item(is_active=false)`.
- **Activate an item:** `update_*_item(is_active=true)`.
- **Swap creative content:** edit `title` / `description` / `thumbnail_url` / `ad_tag` etc.
- **Update landing page:** edit `url`.

Item edits do not change the campaign's locked type — a Display item cannot be converted to Native by editing fields.

### `update_campaign`

Use to edit any campaign field after creation. Common patterns:

| Intent | Field(s) to update |
|---|---|
| Pause / resume campaign | `is_active` |
| Change daily budget | `daily_cap` (with `spending_limit_model="NONE"` + `daily_ad_delivery_model="STRICT"`) |
| Move budget cadence to monthly | `spending_limit_model="MONTHLY"` + `spending_limit` (monthly cap amount) |
| Move budget cadence to lifetime / entire flight | `spending_limit_model="ENTIRE"` + `spending_limit` (total amount) |
| Block / unblock a publisher | `publisher_targeting` (full block-list — pass the new INCLUDE/EXCLUDE set) |
| Add per-publisher bid modifier (Enhanced CPC / Fixed Bid only) | `publisher_bid_modifier` |
| Tighten or broaden targeting | the relevant targeting block (`country_targeting`, `platform_targeting`, etc.) |
| Add a Target CPA on a Maximize Conversions campaign | switch `bid_strategy=TARGET_CPA` + set `cpa_goal`. **Last-resort lever** per `knowledge/bidding.md`; never at launch, never aspirational. |
| Add / change tracking | `tracking_code` |
| Set or change the campaign's conversion goal | `conversion_rules`. **This REPLACES whatever the campaign inherits from its Campaign Group — it is not added to it.** If the campaign is in a group, read the group first and show both sides in the preview: the rules it inherits today, and the campaign-only set it will have afterwards. A user who says "my campaign has no conversion goal" may simply be inheriting one; correct the premise before writing. |
| Put an ungrouped campaign into a group | `campaign_group_id` (string). **Attach only**, and only when the campaign has no `campaign_group_id` today and the target group's `budget_distribution_method` is `CUSTOM`. Read both the campaign and the group first. |

Fields that CANNOT be changed after create:

- `marketing_objective` — re-create the campaign instead.
- `pricing_model` — re-create the campaign instead.
- Campaign type (Native vs Display) — derived from `pricing_model` + first attached item; locked at create. Re-create instead.
- `account_id` — never move a campaign between accounts.
- `campaign_group_id` **once it is set** — the MCP can attach an ungrouped campaign to a group, but cannot move it to another group or detach it. That is a Realize UI action.

## 3b. Account-level write tools — `create_conversion_rule` / `update_conversion_rule`

Field reference for the two account-scoped writes. The workflow, tiers, and account-level consequence rules live in `SKILL.md` → *Conversion rules — account-level writes*; this table carries the shapes and units.

| Field | Type / values | Notes |
|---|---|---|
| `display_name` | string | Unique per account across **all** statuses; must not contain `^`. |
| `type` | `BASIC` / `EVENT_BASED` | **Immutable after create.** `BASIC` pairs with `event_name="page_view"`. (The read also returns `ENGAGEMENT` rules; the write surface cannot create or edit those.) |
| `category` | one of `VIEW_CONTENT`, `SEARCH`, `ADD_TO_CART`, `ADD_TO_WISHLIST`, `START_CHECKOUT`, `ADD_PAYMENT_INFO`, `MAKE_PURCHASE`, `LEAD`, `COMPLETE_REGISTRATION`, `APP_INSTALL`, `SIGNUP`, `CONTACT`, `SUBSCRIBE`, `ENGAGEMENT`, `OTHER` | **Immutable after create.** |
| `event_name` | string | **Immutable after create.** Only one ACTIVE rule may hold an event — pre-read and check before create. |
| `condition` | nested tree (`URL_*` / `EVENT_PARAM_*` operators) | **Partial-merge on update** — omitted = kept. Never echo the read payload back. |
| `look_back_window` | integer, **days** (1–30) | Click-through window. |
| `view_through_look_back_window` | integer, **minutes** (1–10080) | "7-day view-through" = `10080`, not `7`. |
| `include_in_total_conversions` | boolean | Account-level blast radius: feeds Total Conversions, which Target CPA / Maximize Conversions bid against. |
| `include_in_total_value` | boolean | **Defaults to `include_in_total_conversions`** when omitted on create. |
| `aggregation_type` | `AGGREGATED` / `LAST_VALUE` | Defaults to `AGGREGATED` (sums values). |
| `effects` | array of `{type, data}` | Values are numeric **strings** (`[{type:"REVENUE", data:"49.99"}]`); pass `[]` for none. |
| `status` | `ACTIVE` / `DISABLED` / `ARCHIVED` | No delete tool — retiring = status change (destructive tier). |
| `rule_id` (update only) | numeric id **as a string** | The same id is an **integer** inside `conversion_rules.rules: [{id}]` on campaign writes. |

Read-only fields the update tool rejects as unknown parameters: `id`, `advertiser_id`, `pixel_id`, `exclude_from_campaigns`, `external_id`, `partner`, `tracked_elements`.

## 3c. Campaign-group write tools — `create_campaign_group` / `update_campaign_group`

Both are **closed schemas** (`additionalProperties: false`), unlike the campaign and item writes: a misspelled field is rejected rather than silently dropped. `update_campaign_group` is a **partial merge** — omit a field and it keeps its stored value.

| Tool | Required |
|---|---|
| `create_campaign_group` | `account_id`, `name`, `spending_limit_model` — the budget period is required even when the split is `CUSTOM` |
| `update_campaign_group` | `account_id`, `campaign_group_id` |

**Fields the API manages itself cannot be set**: `status`, `bid_strategy`, `cpa_goal`, `language`.

| Field | Values | Notes |
|---|---|---|
| `name` | string | |
| `marketing_objective` + `kpi` | see the pairing below | **On create they travel together — send both or neither.** The backend defaults a missing `kpi` to CPA, which two objectives do not offer, so an objective alone can build a group the UI could not. On update, changing the objective alone fails when the stored `kpi` is not offered for the new one. |
| `kpi_data` | `{kpi_threshold_value, kpi_goal_value}` | **The field names do not mean what they say.** `kpi_threshold_value` is *"increase spend if CPA is **below** this"*; `kpi_goal_value` is *"reduce spend if CPA is **above** this"*. Both in account currency, both > 0. Feeds recommendations only, and only when `kpi` is CPA **and both are set** — it is not a Target CPA. |
| `conversion_rules` | `{rules: [{id}]}` | Two choices, as in the UI. **Account default:** omit on create, or send `{rules: []}` on update. **Manual:** ACTIVE rule ids from `get_conversion_rules`. On update, omitting the field keeps the group's current rules. These apply to every campaign in the group that sets none of its own. |
| `budget_distribution_method` | `CUSTOM` / `AUTOMATIC` | `CUSTOM` (default): each campaign keeps its own budget. `AUTOMATIC`: Taboola allocates the group's budget; it needs a limited budget, so `spending_limit_model: NONE` is rejected. |
| `spending_limit_model` | `NONE` / `MONTHLY` / `ENTIRE` | Required on create. `MONTHLY` / `ENTIRE` take `spending_limit`; `NONE` requires **both** `daily_cap` and `daily_ad_delivery_model: STRICT`. |
| `spending_limit` | number | For the chosen period, in account currency. |
| `daily_cap` | number | Works only with `STRICT` pacing. Send a cap with `BALANCED` and the tool keeps the cap, switches to `STRICT`, and says so in the response. `0` means no cap. |
| `daily_ad_delivery_model` | `BALANCED` / `STRICT` | `BALANCED` is the default and allows no cap — switching to it **clears** the group's cap. |
| `start_date` / `end_date` | `yyyy-MM-dd` | Start defaults to today on create; omit `end_date` for no end. Campaigns in the group must start on or after, and end on or before. |
| `is_active` | boolean | `false` pauses **the whole group**, `true` resumes it. |

**Objective → KPI.** The backend accepts any pairing; this is the Realize UI's own table and the tool enforces it, so a group built outside it would carry a combination the UI never produces.

| `marketing_objective` | Allowed `kpi` |
|---|---|
| `BRAND_AWARENESS` | `CTR`, `CPC`, `CPM` |
| `DRIVE_WEBSITE_TRAFFIC` | `CTR`, `CPC`, `CPQV` |
| `LEADS_GENERATION` | `CTR`, `CPC`, `CPA`, `CPL`, `ROAS` |
| `ONLINE_PURCHASES` | `ROAS`, `CPA`, `CTR`, `CPC` |
| `MOBILE_APP_INSTALL` | `CPI`, `ROAS`, `CPA`, `CTR`, `CPC` |

**What the preview must say, beyond the field diff.** A group write is not scoped to one object:

- Changing `budget_distribution_method`, or the budget of a shared group, **updates every campaign in the group**. Moving a group to `AUTOMATIC` copies its budget onto all of them.
- `is_active: false` pauses every campaign in the group.
- A `REALIZE_PLUS` group cannot change `marketing_objective`, `kpi`, `kpi_data` or `budget_distribution_method`.
- **There is no delete.** Deleting a group terminates all its campaigns, so the supported retirement is `is_active: false`.

Read the group first with `get_campaign_groups` — by id, per `knowledge/campaign-structure.md` → *Reading a campaign group* — so the preview shows real current values rather than blanks.

## 4. Per-strategy bid-lever gate matrix

The canonical matrix lives in `knowledge/bidding.md` ("Bid Levers — What's Possible at Each Level"). Quick reference for write payloads:

| Action level | Enhanced CPC (`SMART`) / Fixed Bid | Target CPA | Maximize Conversions | Maximize Value |
|---|---|---|---|---|
| **Campaign-level Target CPA** (`cpa_goal`) | n/a | ✅ | n/a | n/a |
| **Campaign-level CPC bid** (`cpc`) | ✅ (both `SMART` and `FIXED`) | ❌ algo decides | ❌ algo decides | ❌ algo decides |
| **Campaign-level CPC cap** (`cpc_cap`) | ❌ API 400 | ❌ API 400 | ✅ (last-resort) | ❌ API 400 |
| **Campaign-level daily budget** (`daily_cap` with `spending_limit_model="NONE"`) | ✅ | ✅ | ✅ | ✅ |
| **Campaign-level monthly / lifetime cap** (`spending_limit` with `spending_limit_model="MONTHLY"` or `"ENTIRE"`) | ✅ | ✅ | ✅ | ✅ |
| **Publisher-level bid boost / de-boost** (`publisher_bid_modifier`) | ✅ | ❌ | ❌ | ❌ |
| **Publisher-level block / unblock / whitelist** (`publisher_targeting`) | ✅ | ✅ | ✅ | ✅ |
| **Item-level bid, priority, weight** | ❌ never | ❌ never | ❌ never | ❌ never |
| **Item-level pause / activate** (`is_active` on the item) | ✅ | ✅ | ✅ | ✅ |
| **Item-level create / edit** | ✅ | ✅ | ✅ | ✅ |
| **Day-parting** (`activity_schedule`) | ✅ | ✅ | ✅ | ✅ |

> **Target ROAS (`roasGoal`)** intentionally has no row in this matrix because it is **not exposed via the MCP** (update-only, DCO accounts only — see scalar field table). If a user asks to set ROAS, refuse the write and route them to the Realize UI.

**Refuse and reframe** any payload that violates the matrix:

- `publisher_bid_modifier` on Maximize Conversions / Target CPA / Maximize Value → reframe as `publisher_targeting` block / whitelist.
- `cpc` on `TARGET_CPA` / `MAX_CONVERSIONS` / `MAX_VALUE` → reframe as `cpc_cap` only if the strategy is `MAX_CONVERSIONS`; otherwise remove (the algorithm decides).
- `cpc_cap` on `TARGET_CPA` / `MAX_VALUE` / `SMART` / `FIXED` → remove (API 400). Only `MAX_CONVERSIONS` accepts `cpc_cap` today.
- Any request to set `target_roas` / `roasGoal` on any write → refuse; route to the Realize UI.
- `cpa_goal` on a non-`TARGET_CPA` campaign → reject; the field only takes effect on Target CPA.
- Any item-level bid / priority / weight field — these don't exist on Realize. Reframe as pause / activate / create / duplicate / edit.

## 5. Discovery + readback tools

### Discovery (resolve every value before any write)

| Tool | Returns | Used for |
|---|---|---|
| `search_accounts(query, page, page_size)` | Account list with opaque `account_id` strings | Resolve account first. `page_size` hard cap = 10. |
| `search_geos(dimension, query)` | Geo entities | Country / region / DMA / city / postal codes. Pick one dimension per call. |
| `search_audiences(account_id, query)` | Account-resident custom audiences | Pixel-built segments, CRM uploads, saved combined audiences. |
| `search_lookalike_audiences(account_id, query)` | Account-resident lookalike seeds | Pixel-based predictive, CRM lookalike, etc. |
| `search_contextual_segments(query)` | Network-wide marketplace catalogue | Demographics, interests, 3P data partner segments. NEVER expected empty for a US-targeted campaign. |
| `search_publishers(query)` | Publisher list | Allow / block list resolution. |
| `get_conversion_rules(account_id, [rule_id], [page], [page_size], [status], [search_text])` | Account conversion rules — a page of them, or one by id | Required for performance objectives. Replaces the deprecated `search_conversion_rules` (removed after 2026-11-01). Also the mandatory pre-read before any conversion-rule write. Paginated (default 25, **max 50**, ordered by rule id; response states the true `total`). **The pre-read is two narrowed calls, not one unfiltered page-through.** Name collision: `search_text=<display_name>` with no `status` (status-agnostic, matches `display_name`), then compare names **exactly** — it is a *contains* match — and page if `total` exceeds a page. Event collision: `status="ACTIVE"` paged to `total`; the rule is one ACTIVE rule per event, so that filter is sound and roughly halves the reads. Only `ARCHIVED` is lossy. A full unfiltered listing is needed just for ownership reporting. |
| `search_techno(dimension, query)` | Techno entities | OS / browser / connection types. |
| `list_cta_types()` | CTA enum values | Native item `cta.cta_type`. |
| `list_time_zones()` | Time zone enum values | Dayparting `activity_schedule.time_zone`. |

### Readback (after writes)

| Tool | Returns | Use after |
|---|---|---|
| `get_campaign(account_id, campaign_id)` | Full campaign object | Single-campaign readback after `create_campaign` or `update_campaign`. |
| `list_campaigns(account_id, page?, page_size?)` | One **page** of campaigns — `page_size` caps at **10** | Account-level rollup after a batch create. **Page until a short page**: after creating 12 campaigns a single call returns 10 and reads as complete. |
| `list_items(account_id, campaign_id)` | All items on a campaign | After `create_*_item` / `update_*_item`. |
| `get_item(account_id, campaign_id, item_id)` | Single item | After a targeted item edit. |

## 6. Common payload patterns

### Maximize Conversions campaign with conversion rule

```
create_campaign(
  account_id=<id>,
  name="<name>",
  marketing_objective="ONLINE_PURCHASES",
  branding_text="<brand>",
  spending_limit_model="NONE",            # enum: NONE | MONTHLY | ENTIRE — daily cap uses NONE + daily_cap below
  daily_cap=<daily_cap_currency>,         # ≥ 10× CPA goal
  daily_ad_delivery_model="STRICT",       # required when daily_cap is set
  bid_strategy="MAX_CONVERSIONS",
  pricing_model="CPC",
  conversion_rules={"rules": [{"id": <resolved_rule_id_int>}]},
  country_targeting={"type": "INCLUDE", "value": ["US"]},
  is_active=False,
)
```

### Target CPA campaign

```
create_campaign(
  ...,
  bid_strategy="TARGET_CPA",
  cpa_goal=<currency>,                    # within 10-20% of stable actual CPA (see knowledge/bidding.md)
  spending_limit_model="NONE",            # daily cap uses NONE + daily_cap (same pattern as MAX_CONVERSIONS above)
  daily_cap=<≥ 10× cpa_goal>,             # 10× CPA goal/day — same floor as MAX_CONVERSIONS
  daily_ad_delivery_model="STRICT",       # required when daily_cap is set
  is_active=False,
)
```

### Maximize Value campaign

```
create_campaign(
  ...,
  marketing_objective="ONLINE_PURCHASES",
  bid_strategy="MAX_VALUE",
  conversion_rules={"rules": [{"id": <resolved_rule_id_int>}]},   # purchase event with value reporting
  is_active=False,
)
```

> ROAS target (`roasGoal` in the API) is **update-only**, **DCO accounts only**, and **not currently exposed by the MCP**. It cannot be set on `create_campaign`. If a user asks to set ROAS, fall back to the Realize UI.

### Enhanced CPC (SMART) with per-publisher bid modifiers

```
create_campaign(
  ...,
  bid_strategy="SMART",
  cpc=<base_bid>,
  publisher_bid_modifier={
    "values": [
      {"target": "<publisher_name>", "cpc_modification": 1.20},   # +20% — multiplier, not delta
      {"target": "<publisher_name>", "cpc_modification": 0.90},   # -10%
    ],
  },
  is_active=False,
)
```

### Fixed Bid VCPM Display campaign

```
create_campaign(
  ...,
  marketing_objective="BRAND_AWARENESS",
  bid_strategy="FIXED",
  pricing_model="VCPM",          # locks campaign as Display at create
  cpc=<per-1000-viewable-impression rate>,   # NOT a click bid on VCPM
  is_active=False,
)
# Then attach Display items only:
create_display_item(
  account_id=<id>, campaign_id=<id>,
  ad_tag="<allowlist-matching tag, first char '<'>",
  dimensions=[{"width": 300, "height": 250}],
  url="<lp_url>",
  creative_name="<name>",
  is_active=False,
)
```

### Pause a live campaign

```
update_campaign(
  account_id=<id>, campaign_id=<id>,
  is_active=False,
)
```

### Block a publisher mid-flight

The full chain — name resolution via `search_publishers`, historical-top-N guard, get → merge → preview-with-resolved-names → confirm → write → verify — is the canonical recipe in **[`skills/manage-campaigns/SKILL.md` → "Publisher block-list edits — recipe"](../SKILL.md)**. Payload-shape sketch only (see SKILL.md for the AskUserQuestion confirm gate, unblock + whitelist-mode-switch cases, and the side-by-side preview):

```
# After resolving names → IDs via search_publishers and reading current state via get_campaign:
# Publisher IDs are STRINGS — pass them verbatim from search_publishers, do not coerce to int.
new_block = list(dict.fromkeys(current.publisher_targeting.value + ["<publisher_id_string>"]))    # de-dupe, preserve order
update_campaign(
  account_id=<id>, campaign_id=<id>,
  publisher_targeting={"type": "EXCLUDE", "value": new_block},
)
```

## 7. Common failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| `400 Unsupported tag` from `create_display_item` | 3P vendor not configured for this account — cannot self-correct | Route the user to their Account Manager (or `support@taboola.com`) for vendor enablement. **Do not retry**; do not strip the wrapper (it won't help). |
| `400 Invalid html tag structure` from `create_display_item` | Markup is wrapped or malformed | Strip everything before the first ad-tag element (no `<!DOCTYPE>`, no `<html>` / `<body>` / `<div>`, no leading whitespace), then retry. |
| `create_campaign` rejected — "conversion rule required" | Performance objective without an attached rule | Attach an existing rule (`get_conversion_rules`), create one (`create_conversion_rule`, through the write gate), or stage with a placeholder per `knowledge/bidding.md` "When the conversion rule isn't ready yet" recipe. |
| `create_conversion_rule` rejected — duplicate event | An ACTIVE rule already holds that `event_name` | Update the incumbent instead. Do **not** disable it to force the create through — that stops reporting for every campaign using it. Surface the choice to the user. |
| `update_conversion_rule` rejected — unknown parameter | A `get_conversion_rules` payload was echoed back | Build a minimal payload of only the changed fields. `id`, `advertiser_id`, `pixel_id`, `exclude_from_campaigns`, `external_id`, `partner`, `tracked_elements` have no parameter on the update tool. |
| `update_conversion_rule` returns READONLY, naming `eventName` | An immutable field changed — `type`, `category`, or `event_name` | The error may name `eventName` even when `type` was what you changed, so don't chase the named field. Resending an immutable field *unchanged* is fine; changing it requires a new rule. |
| `get_conversion_rules` fails with a tool-result overflow error and a file path | A single page was still too large for the tool-result cap on a rule-heavy / NETWORK account (observed 278 rules / ~270 KB unfiltered) | **Lower `page_size` (max 50) and retry** — that is the first fix now that the read is paginated. If it still overflows, read the dumped file in slices (or `grep` it via Bash) and run the collision + ownership checks against it. Do not retry unmodified at the same `page_size`, do not skip the pre-read, do not treat the overflow as "no rules". |
| Item creation succeeds but item shows wrong campaign type in UI | Created a Native item on a campaign destined for Display (or vice versa) | Item locks campaign type irreversibly. Pause the wrong-type campaign and create a fresh one with the intended type. See `knowledge/creative.md` "If a Native campaign was created by mistake when Display was wanted". |
| `cpc` field accepted but ignored on Maximize Conversions / Target CPA / Maximize Value | The algorithm sets the bid on fully-automated strategies — `cpc` is silently dropped | Don't set `cpc` on these strategies. If a ceiling is needed, use `cpc_cap` (last-resort). |
| `update_campaign` rejected with "marketing objective cannot change" | Trying to switch objective on a live campaign | Create a new campaign instead. Objective is locked at create. |
| Server-side crawl returns wrong creative for a Native item | Supplied `url` differs from the canonical page, or the page is JS-rendered without server-side meta | Supply `title` + `description` + `thumbnail_url` explicitly rather than relying on crawl. |

## 8. Cross-references

| File | Purpose |
|---|---|
| `knowledge/bidding.md` | Bid strategy mechanics, Bid Levers matrix (canonical), Learning-Period Guard, KPI → objective mapping. |
| `knowledge/budget.md` | 10× CPA rule, pacing, scaling, depletion-miss investigation. |
| `knowledge/campaign-structure.md` | Native vs Display lock-in (two-path), platform/device splits, Campaign Groups, Realize+ context. |
| `knowledge/creative.md` | Sponsored Content + Display creative strategy, Gen AI AdMaker, landing pages, creative review, testing, fatigue. (Display item payload shape — `ad_tag` 3P vs `asset_url` + `dimensions` 1P — lives in `knowledge/targeting.md`. Wilson-score creative ranking lives in `skills/optimize-campaign/references/optimization-flow.md` §3.) |
| `knowledge/targeting.md` | Marketplace vs account-resident audiences, Tier-1 markets, 6-dimension narrow-targeting diagnostic, small-market caveat. |
| `knowledge/site-management.md` | Historical-top-N publisher block guard, block-attribution framework. |
| `knowledge/brand-safety.md` | DV / IAS pre-bid, topic exclusions. |
| `knowledge/tracking.md` | Taboola Pixel / S2S, conversion-event design, troubleshooting. |
| `knowledge/custom-rules.md` | SpendGuard + Custom Rules (UI-only today). |
| `knowledge/reach-estimation.md` | Pre-launch reach estimation via `mcp__realize-mcp__get_campaign_reach_estimate` — use before `create_campaign` to validate the planned targeting won't be too narrow to deliver. |
