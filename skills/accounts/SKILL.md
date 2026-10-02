---
name: accounts
description: Discover Realize accounts and capture the account_id required by every other Realize MCP tool. Must run before any campaign or report query.
allowed-tools: ["Read", "Bash", "AskUserQuestion"]
---

# Accounts

Every other Realize MCP tool requires an `account_id`. This skill resolves one.

## When to use

- The user mentions a new account name, numeric ID, or advertiser.
- No `account_id` is cached for the current session.
- The user's question is ambiguous about which account they mean.
- The user wants to switch accounts.

## Workflow

1. **Call `search_accounts`** with the user's input. `query` is **optional** and routed server-side by shape: a pure-digits string is an exact `id` lookup, free text is a fuzzy name lookup, and an **omitted or empty `query` lists all accounts** the authenticated user has access to. To fuzzy-search a number rather than look it up exactly, append `*` (`"123*"`).
   ```
   # the user named an account:
   mcp__realize-mcp__search_accounts(query="<user input>", page_size=10, page=1)

   # "list all my accounts" — omit query entirely, do NOT pass "*" or "all":
   mcp__realize-mcp__search_accounts(page_size=10, page=1)
   ```
2. **Inspect the response.** The returned `account_id` is an **opaque string** supplied by the server (examples from upstream docs: `advertiser_12345_prod`, `mktg_corp_001`), not the numeric ID the user might have typed. Do not fabricate, re-case, or otherwise transform it — pass it through verbatim.

   Each result also carries `currency`, `country`, `time_zone_name` (use these for budget amounts and `activity_schedule.time_zone`) and the account **`type`**. **Carry `type` forward — it decides which report tool the `reports` skill can use:** `PARTNER` and `NETWORK` support the metamodel dynamic report; **`GROUP` accounts and admin networks do not** (the dynamic tools return 403 by design) and must use `get_campaign_breakdown_report`. Note the type when you resolve the account, so reporting routes correctly the first time instead of recovering from a 403.
3. **Disambiguate if multiple results.** Use `AskUserQuestion` to let the user pick. Show account name + `account_id` string in each option.
4. **Paginate if needed.** If the user's match isn't in the first page, call again with `page=2`, keeping `page_size` constant. Hard cap: `page_size=10`.
5. **Persist the choice** (optional). If the user wants this as their default, write it to `.claude/realize.local.md` (gitignored):
   ```yaml
   ---
   default_account_id: advertiser_12345_prod
   default_account_name: Example Advertiser
   ---
   ```

## Example

**User:** "Pull my Q1 numbers for Example Advertiser."

**You:**
1. `search_accounts(query="Example Advertiser")` → one result, `account_id=advertiser_12345_prod`.
2. Cache it, hand off to `reports` skill for the actual data pull.

**User:** "Show me the acme account."

**You:**
1. `search_accounts(query="acme")` → three matches.
2. `AskUserQuestion`: "Which Acme account?" with each `account_id` as an option.
3. Proceed with the user's pick.

## Gotchas

- **Numeric IDs from the user are not `account_id`s.** Users often say "account 12345" meaning the numeric ID; the MCP expects the opaque string returned by `search_accounts`. The server explicitly rejects numeric-only IDs passed as `account_id` to downstream tools, so always route through `search_accounts` first.
- **Hard page_size cap of 10.** Unlike report tools (cap 100), account search is silently clamped to 10 per page — passing `page_size=50` still returns 10 rows.
- **Omit `query`** to list all accounts when the user asks for an inventory, rather than guessing a search term. Upstream documents the empty/omitted query as the list-all form and documents `*` only as a suffix for fuzzy-matching a number (`"123*"`); it says nothing about a bare `*`. Don't rely on one.
- **Don't cache stale account_ids across sessions** without re-validating if the user hasn't confirmed.
