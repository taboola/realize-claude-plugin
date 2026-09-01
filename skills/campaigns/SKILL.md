---
name: campaigns
description: List and inspect Realize campaigns and their creatives/items. Use after an account_id is resolved.
allowed-tools: ["Read", "Bash", "AskUserQuestion"]
---

# Campaigns

Inspection of campaigns and their items (creatives) for a given account using the campaign query tools currently exposed by the MCP.

## Prerequisites

- `account_id` resolved via the `accounts` skill. If missing, hand off there first.

## Related skills

- For **writes** — create or update a campaign or native item — hand off to the [`manage-campaigns`](../manage-campaigns/SKILL.md) skill. This skill stays read-only.

## Tools this skill wraps

| Tool | Required params | Paginated? |
|---|---|---|
| `mcp__realize-mcp__list_campaigns` | `account_id` | **No** — full list in one call |
| `mcp__realize-mcp__get_campaign` | `account_id`, `campaign_id` | — |
| `mcp__realize-mcp__list_items` | `account_id`, `campaign_id` | **No** — full list in one call |
| `mcp__realize-mcp__get_item` | `account_id`, `campaign_id`, `item_id` | — |

None of these tools accept pagination or filter parameters. If a campaign has hundreds of items, they all come back in the single `list_items` call. Filter or summarize in post-processing rather than paginating.

## Typical flows

**"List my active campaigns."**
1. `list_campaigns(account_id=...)`
2. Inspect the `status` field on each campaign and filter in memory to rows with an active/running status (the exact enum comes from the API response — e.g., `RUNNING`). Then summarize: count, combined spend, date range.

**"What's the deal with campaign 98765?"**
1. `get_campaign(account_id=..., campaign_id=98765)` for configuration and status.
2. `list_items(account_id=..., campaign_id=98765)` for the creative list.
3. Summarize: objective, budget, targeting, creative count, any items flagged paused/rejected.

**"Show me the creatives for my top-spending campaign."**
1. Combine with the `reports` skill: run a campaign-grain dynamic report sorted by spend DESC (`get_dynamic_report_settings` → `get_dynamic_report_data`), pick the top campaign.
2. `list_items(account_id=..., campaign_id=<top>)` and list creatives with IDs, names, status.

## Interpretation guidelines

- **Always cite the account in your summary.** Make it obvious which account the numbers are from.
- **Don't list raw JSON back at the user.** Pull the 3–5 fields that answer their question (status, spend, budget, objective) and surface those in prose.
- **If the list is long** (>20 campaigns), offer a filter before paginating — most questions don't need the full list.

## Gotchas

- Treat `campaign_id` and `item_id` as **opaque identifiers** returned by the API. Pass them through to follow-up tool calls exactly as received — do not coerce to numbers or strip/format them.
- An item's status is distinct from its campaign's status — a running campaign can have rejected items. Flag this when relevant.
