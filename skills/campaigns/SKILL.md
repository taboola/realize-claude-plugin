---
name: campaigns
description: List and inspect Realize campaigns, their creatives/items, and the campaign groups above them. Use after an account_id is resolved. Also answers "what is this campaign optimizing toward" — a group's conversion goal covers every campaign in it that sets none of its own.
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
| `mcp__realize-mcp__list_campaigns` | `account_id` | **Yes** — `page` / `page_size`, **max 10 per page** |
| `mcp__realize-mcp__get_campaign` | `account_id`, `campaign_id` | — |
| `mcp__realize-mcp__list_items` | `account_id`, `campaign_id` | **No** — full list in one call |
| `mcp__realize-mcp__get_item` | `account_id`, `campaign_id`, `item_id` | — |
| `mcp__realize-mcp__get_campaign_groups` | `account_id` | **Yes** — `page` / `page_size`, max 50. To read **one** group, use the list form with `search_text="<the group id>"`; the `campaign_group_id` parameter returns a thinner projection that may omit `conversion_rules` and the budget fields |

`list_campaigns` **is paginated and caps at 10 rows per page** — page until a short page before claiming you have every campaign. `list_items` is not paginated: if a campaign has hundreds of items they all come back in one call, so filter or summarize in post-processing. Of these, only `get_campaign_groups` accepts filter parameters (`statuses`, `search_text`); the rest take none.

**The owning-account rule.** `get_campaign`, `list_items` and `get_campaign_groups` need the campaign's **owning** account, which is the `advertiser_id` on the campaign row from `list_campaigns` — not necessarily the account you listed from. A NETWORK or parent account can *list* its children's campaigns but rejects calls scoped to them — 404 on campaign-level calls, 403 on item-level ones, and a group read against the wrong account does not return the group — whether it errors or comes back empty, treat it as unread, never as "this campaign has no group goal". Always carry `advertiser_id` forward from the listing rather than reusing the account you searched with.

## Typical flows

**"List my active campaigns."**
1. `list_campaigns(account_id=...)` — then **keep paging until a page returns fewer than `page_size` rows.** The cap is 10 per page, so a single call covers only the smallest accounts; answering from it gives a wrong count and a wrong combined spend, presented as the whole account.
2. Inspect the `status` field on each campaign and filter in memory to rows with an active/running status (the exact enum comes from the API response — e.g., `RUNNING`). Then summarize: count, combined spend, date range — and state how many campaigns you actually read.

**"What is this campaign optimizing toward?"**
1. `get_campaign(account_id=..., campaign_id=...)` and read `conversion_rules`. **It comes back as an object, not a list** — `{"rules": [...]}`, and it has **three** states, not two: a non-empty `rules` array is the campaign's own goal; an empty one means it inherits; anything else (key absent, `null`, an object with no `rules`) means **unread** — say so rather than resolving to a goal. The condition that sends you to step 2 is **`conversion_rules.rules` being an empty array**, not the field being absent. `{"rules": []}` is the inherit-from-the-group case, and it is truthy — treating the object itself as "not empty" and stopping here is the exact failure this flow exists to prevent.
2. With `rules` empty, **do not answer "the account default"** — take the campaign's `campaign_group_id` and read that group. A group's rules cover every campaign in it that has none of its own.
   - **If the campaign has no `campaign_group_id`,** there is no group step — go straight to step 3 and say the goal is the account default.
   - **If the group read fails, is refused, or returns no row whose `id` matches,** say the group could not be read — an empty result is a clean success, not evidence the group has no goal — and name the account default as the *fallback you are reporting*, not as the verified answer.
   - **Read the group by following `knowledge/campaign-structure.md` → *Reading a campaign group*** — the list form, the matching row, and what an unread group means. Restating it here is how it drifts.
3. Only if the group's rules are empty too does the account default apply (`get_conversion_rules`, ACTIVE rules marked include-in-total).
4. Tell the user the goal **and which level set it**. The resolution order is campaign → group → account. Rules set on the campaign **replace** the group's for that campaign; they are not added to them.
5. **Name the event, not the id — and say so when the rule is not live.** A campaign's `conversion_rules` carries only `{id}`, so resolve every id with `get_conversion_rules(account_id, rule_id="<the id>")` — by id, **with no `status` filter**. The ACTIVE-by-default listing would hide the very rule you are checking. "It optimizes toward rule 4417" is not an answer. If the rule is `DISABLED` or `ARCHIVED`, it is **still the campaign's goal** — the group's does not take over — so name it *and* say it is retired. Reporting the group's goal instead is the failure here. If the account default resolves to **several** include-in-total events, say so plainly and list them: the campaign is optimizing toward all of them, which is worth flagging if the user cares about only one.

**"Show me the campaign groups on this account."**
1. `get_campaign_groups(account_id=..., page=1, page_size=50)`. **`account_id` must be the advertiser that owns the groups** — a group belongs to the advertiser its campaigns belong to, not to a NETWORK or parent account they were listed through. A read scoped to an account that does not own the groups may simply not return them, so treat an empty result as unread rather than as "this account has no groups".
2. **To narrow to live groups, pass `statuses=["RUNNING"]`.** **`ACTIVE` is not a valid value here** — the call is rejected outright rather than ignored. That is the likely mistake, because `ACTIVE` is the status word the rest of the plugin uses (conversion rules). The full set is `PENDING`, `PENDING_START_DATE`, `FROZEN`, `DEPLETED`, `DEPLETED_IN_MONTHLY`, `EXPIRED`, `PAUSED`, `RUNNING`, `TERMINATED`, `STOPPED`. `search_text` matches a name substring, or an exact group id.
3. Read `total` from the first page when it is there — it is there whenever upstream supplies one. Page until you hold it; if `total` is absent, page until one comes back shorter than `page_size`.
4. **Past a couple of dozen groups, summarize instead of listing** — counts by status, then ask how the user wants it narrowed. A 100-row dump is not an answer.
5. `STOPPED` means the group was deleted. Don't offer those as live options, and don't describe one as "stopped".
6. **If you report a group's conversion rules, say they are what the *group* selects — not what its campaigns optimize toward.** A member campaign can carry its own goal that replaces the group's and is invisible in Realize. Answering "this group optimizes toward X" as though it settles every campaign in it is the failure; resolve per campaign when the question is about a campaign.

**"What's the deal with campaign 98765?"**
1. `get_campaign(account_id=..., campaign_id=98765)` for configuration and status.
2. `list_items(account_id=..., campaign_id=98765)` for the creative list.
3. Summarize: objective, budget, targeting, creative count, any items flagged paused/rejected.

**"Show me the creatives for my top-spending campaign."**
1. Combine with the `reports` skill: run a campaign-grain dynamic report sorted by spend DESC (`get_dynamic_report_settings` → `get_dynamic_report_data`), pick the top campaign. On a **GROUP or admin-network** account the dynamic tools 403 — use `get_campaign_breakdown_report` (`sort_field="spent"`, `sort_direction="DESC"`) instead; the `reports` skill owns that routing rule.
2. `list_items(account_id=<the top campaign's `advertiser_id`>, campaign_id=<top>)` and list creatives with IDs, names, status. **Use the campaign's `advertiser_id`, not the account you reported on** — on a NETWORK / parent / GROUP account, passing the reporting account here returns 403.

## Interpretation guidelines

- **Always cite the account in your summary.** Make it obvious which account the numbers are from.
- **Don't list raw JSON back at the user.** Pull the 3–5 fields that answer their question (status, spend, budget, objective) and surface those in prose.
- **If the account is large**, ask what the user actually needs before paging through it. For campaigns and items you will not know the size from the first call — `list_campaigns` caps at 10 — so judge from the second page onward, or from the user's own description of the account. For **campaign groups you usually know immediately**: the first page states the true `total` when upstream supplies one, so decide up front whether to list or summarize — and fall back to the short-page rule when it is absent. Most questions don't need the full list.

## Gotchas

- Treat `campaign_id` and `item_id` as **opaque identifiers** returned by the API. Pass them through to follow-up tool calls exactly as received — do not coerce to numbers or strip/format them.
- An item's status is distinct from its campaign's status — a running campaign can have rejected items. Flag this when relevant.
