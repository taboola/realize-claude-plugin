---
name: discovery
description: Look up Realize targeting metadata, audiences, publishers, conversion rules, time zones, and CTA types. Use when the user asks "what X is available" or needs an opaque ID before going to the Realize UI. Read-only — no campaign or item state is changed.
allowed-tools: ["Read", "Bash", "AskUserQuestion"]
---

# Discovery

Resolve opaque IDs and enumerate the catalogs that Realize's targeting / audience / publisher / conversion settings draw from. This skill wraps the nine read-only "look it up" tools the MCP exposes, so the user does not have to guess country codes, audience IDs, publisher IDs, segment IDs, conversion-rule IDs, CTA enum values, or IANA time zone names.

## When to use

Trigger on any of:

- "What countries / regions / DMAs / cities / postal codes can I target?"
- "What operating systems / browsers does Realize support?"
- "What audiences / lookalike audiences / contextual segments are available on account X?"
- "List publishers on account X" / "Find publishers matching <name>"
- "What conversion rules are configured on account X?"
- "What time zones does Realize support?"
- "What CTA button types are available for native items?"
- Any campaign-creation walkthrough where the user needs to paste an opaque ID rather than a display name.

For pulling **performance numbers**, route to the `reports` skill instead. For campaign/item lookup, route to the `campaigns` skill.

## Prerequisites

- `account_id` resolved via the `accounts` skill is required for every tool below **except** `search_geos`, `search_techno`, `list_time_zones`, and `list_cta_types` (those are global catalogs).

## Tools this skill wraps

| Tool | Required params | Optional params | Returns |
|---|---|---|---|
| `mcp__realize-mcp__search_geos` | `dimension` ∈ {`countries`, `regions`, `dma`, `cities`, `postal_codes`} | `country_code` (ISO-2 — **required** when `dimension` ≠ `countries`) | `{dimension, values: [{code, name}, ...]}` |
| `mcp__realize-mcp__search_techno` | `dimension` ∈ {`operating_system_versions`, `browsers`} | `os_family` (**required** when `dimension=operating_system_versions`) | `{dimension, values: [...]}` |
| `mcp__realize-mcp__search_audiences` | `account_id` | `country_codes` (comma-separated ISO-2), `country_targeting_type` ∈ {`ALL`, `INCLUDE`, `EXCLUDE`} | Audience list with `audience_id`, `name`, ... |
| `mcp__realize-mcp__search_lookalike_audiences` | `account_id` | `country_code` (ISO-2) | Lookalike rules with `rule_id`, ... |
| `mcp__realize-mcp__search_contextual_segments` | `account_id` | `country_codes`, `country_targeting_type` | Segments with `segment_id`, ... |
| `mcp__realize-mcp__search_publishers` | `account_id`, `query` (use `"*"` for all) | `publisher_ids` (array of int), `page` (default 1), `page_size` (max **50**, default 10) | Paginated publisher list `{id, name, account_id, country, is_active}` |
| `mcp__realize-mcp__get_conversion_rules` | `account_id` | `rule_id` (numeric id **as a string**, narrows to one rule) | `{account_id, values: [...]}` — each rule in full, with `condition` and `effects`. Not paginated **and no status filter** — rule-heavy accounts overflow the tool-result cap; see Gotchas. |
| `mcp__realize-mcp__list_time_zones` | — | — | Array of IANA time zone names (e.g., `America/New_York`) |
| `mcp__realize-mcp__list_cta_types` | — | — | Array of valid `cta_type` enum values |

## Examples

- *"What DMAs are available in the US?"* → `search_geos(dimension="dma", country_code="US")`.
- *"List regions in Brazil."* → `search_geos(dimension="regions", country_code="BR")`.
- *"All Windows OS versions I can target?"* → `search_techno(dimension="operating_system_versions", os_family="Windows")`.
- *"Audiences on account advertiser_12345_prod for US/CA, include-mode."* → `search_audiences(account_id="advertiser_12345_prod", country_codes="US,CA", country_targeting_type="INCLUDE")`.
- *"Lookalike audiences for account X in Canada."* → `search_lookalike_audiences(account_id="...", country_code="CA")`.
- *"Contextual segments for account X."* → `search_contextual_segments(account_id="...")`.
- *"Publishers matching 'news' on account X."* → `search_publishers(account_id="...", query="news")`.
- *"All publishers on account X."* → `search_publishers(account_id="...", query="*")`. Paginate if needed — `page_size` is hard-capped at 50.
- *"Conversion rules on account X."* → `get_conversion_rules(account_id="...")`.
- *"Show me conversion rule 3312."* → `get_conversion_rules(account_id="...", rule_id="3312")`.
- *"What time zones does Realize accept?"* → `list_time_zones()`.
- *"What CTA button types exist?"* → `list_cta_types()`.

## Workflow

1. **Resolve `account_id` first** (if the tool requires it) via the `accounts` skill — see the [`accounts`](../accounts/SKILL.md) skill.
2. **Pick the narrowest tool** for the question. Don't pull all publishers when the user named one.
3. **Honor the dimension prerequisites:**
   - `search_geos` with `dimension` in {`regions`, `dma`, `cities`, `postal_codes`} requires `country_code` — ask the user for it before calling, or default to the user's stated geo if obvious.
   - `search_techno` with `dimension=operating_system_versions` requires `os_family` (e.g., `Windows`, `iOS`, `Android`, `macOS`).
4. **Summarize in prose, not raw JSON.** Pick the 3–5 most relevant rows, surface IDs alongside display names so the user can paste them downstream. If the list is long, offer to filter or paginate.
   - **Conversion rules: ACTIVE by default, disclosed.** When listing or resolving conversion rules, work with `status: "ACTIVE"` rules only and always add one short line with exact counts — e.g., *"showing 102 active rules — 176 disabled/archived skipped, say if you want them"*. Include DISABLED / ARCHIVED rules only when the user explicitly asks ("show all", "include disabled"). Never skip silently: the disclosure line is mandatory whenever anything was filtered out. This default is for user-facing listings only — when the read feeds a pre-write collision check in `manage-campaigns`, all statuses count. Word any oversized-response disclosure without file paths or tool names (the internals bans in `os/guardrails.md` still apply).
5. **Hand off the ID downstream.** When the user is mid-flow in the `manage-campaigns` skill (collecting create/update inputs), return the opaque ID(s) verbatim so they can be slotted into the write payload before the preview-and-confirm step.

## Gotchas

- **`country_code` is ISO-2, uppercase.** `US`, not `USA` or `us`. The MCP will reject other forms.
- **`search_publishers` `page_size` cap is 50**, not 100 — different from report tools. Default is 10.
- **`query="*"` lists all** publishers, but the result is still paginated — don't assume page 1 is the full set.
- **Audience country filters are passthrough.** `country_codes` and `country_targeting_type` are forwarded to the upstream API; verify the result actually narrowed by checking the row count.
- **Catalogs change.** Time zones and CTA types are versioned upstream — don't cache them across sessions; re-pull when starting a new campaign-creation flow.
- **`search_conversion_rules` is deprecated.** It was renamed to `get_conversion_rules`, and the old name is removed after **2026-11-01**. Behavior is identical and the old name also accepts `rule_id` now, but use `get_conversion_rules` everywhere.
- **`get_conversion_rules` returns ACTION rules only.** Pixel *audience* rules are not in the response, so an empty result doesn't mean the account has no pixel activity.
- **Rule-heavy accounts overflow the tool result.** The read is unpaginated with no status filter, so a large / NETWORK account can exceed the tool-result cap — observed live: **278 rules / ~270 KB, only 102 of them ACTIVE**. The call then returns an error plus a **path to a dumped result file** instead of inline rules. Recovery: **Read that file in slices (or search it with `grep` via Bash)** and build a slim projection per rule (`id`, `display_name`, `event_name`, `status`, `advertiser_id`) — `rule_id` narrowing can't substitute, because the listing is the only way to learn the IDs. Never re-call unmodified (same overflow), never give up, and never present a partial read as the account's full rule set — state what was read. Interim guidance until upstream adds pagination / status filtering.
- **The account you query is often not the account that owns the rules.** Each rule's `advertiser_id` names its owner, and it runs both directions: a parent / NETWORK account returns its children's rules, **and a child account returns the network's rules**. Observed on a real account — querying a child returned 62 rules, all 62 owned by the parent network and none by the account queried. Always report ownership rather than presenting everything as "this account's rules", and check `advertiser_id` before handing an ID downstream to a write.
- **Not everything readable here is writable.** The response includes `type: "ENGAGEMENT"` rules with `SESSION_DEPTH` / `TIME_ON_SITE` conditions; the create and update tools accept neither (`type` is `BASIC` / `EVENT_BASED` only). Surface them when listing, but route edit requests for them to the Realize UI.
- **The read payload is not a valid update payload.** If the user wants a rule changed, hand off to `manage-campaigns` with the rule ID and the intended edits, not the object you just read.
- **Pass IDs verbatim downstream — and respect their underlying type.** `account_id`, `campaign_id`, `item_id`, and publisher `id` are **opaque strings** returned by the API; do not coerce to int. `audience_id`, `segment_id`, lookalike `rule_id`, and conversion-rule `id` are **integers** — pass them as numbers, not stringified. In all cases, do not strip or re-case the value returned by the search / list tool.
