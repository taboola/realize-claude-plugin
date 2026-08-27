# Realize Plugin

Query Taboola **Realize** campaigns and pull performance reports through natural language, straight from Claude Code. Powered by the [Realize remote MCP](https://github.com/taboola/realize-mcp).

> **Scope today:** account discovery, campaign and item inspection, targeting / audience / publisher / conversion-rule lookup, performance reports, and **create + update for campaigns and Native + Display items** — each write gated behind a preview-then-confirm that prominently surfaces the target account. A trimmed UI fallback remains for the few actions still not supported here (delete, duplicate, bulk operations, Custom Rules, conversion-rule creation, CRM uploads).

## Prerequisites

- [Claude Code](https://claude.ai/claude-code) CLI installed (`claude --version` works)
- A Realize account (you'll authenticate via Taboola SSO on first use)
- Network access to `https://mcp.realize.com/mcp`

## Quick Start (Remote — recommended)

The plugin ships with the remote Realize MCP pre-wired. No local setup required — OAuth 2.1 is handled automatically by Claude Code.

Choose the path that matches how you consume Claude Code plugins:

### Option A — Install from a marketplace *(recommended)*

```bash
claude plugin i realize-plugin
```

That single command installs everything — the `realize-analyst` agent, the skills, and the Realize MCP wiring. On the first tool call, Claude Code opens a browser for Taboola SSO to complete OAuth 2.1; after that you're ready to run prompts like *"List my Realize accounts"*.

> Requires the plugin to be registered with a Claude Code plugin marketplace your CLI has access to. See [Claude Code plugin docs](https://code.claude.com/docs/en/plugins) for the marketplace configuration specific to your Taboola distribution.

### Option B — Local development / custom loading

Clone the repo and load it as a local plugin via `--plugin-dir`:

```bash
git clone https://github.com/taboola/realize-claude-plugin
cd realize-claude-plugin
claude --plugin-dir .
```

> **The path is relative to where you launch `claude`.** From inside the repo use `.`; from the parent folder use `./realize-claude-plugin`. A path that doesn't exist loads **nothing and prints no error** — the session looks normal but every plugin command returns `Unknown command`. Verify with `claude --plugin-dir . plugin list` and look for `realize-plugin@inline … ✔ loaded`.

Plugin components are namespaced by plugin name, so commands are invoked as `/realize-plugin:<name>` (e.g. `/realize-plugin:support`), not bare `/support`. Typing `/` lists what's actually available in the session.

This loads the skills, agent, and MCP wiring directly from the repo without requiring a marketplace install. Use this for iterating on skills, testing scenarios, or running the plugin inside a restricted/air-gapped environment.

On first tool call, Claude Code opens a browser for Taboola SSO login and returns you to the terminal once authenticated.

### Option C — Just the MCP, without this plugin's skills/agent

If you only want the remote Realize MCP and not the opinionated skills/agent this plugin provides:

```bash
claude mcp add --transport http --callback-port 3000 realize-mcp https://mcp.realize.com/mcp
```

## Authentication

- **OAuth 2.1 via Taboola SSO.** On first tool call, your default browser opens to the Taboola login page. Enter your credentials; Claude Code stores the resulting token securely.
- **No manual token management.** Token refresh is handled by the transport layer.
- **Multi-user safe.** The remote endpoint is stateless and per-user — no shared credentials.

## Dependency

This plugin wraps the remote [realize-mcp](https://github.com/taboola/realize-mcp) server, which is its sole runtime dependency. The server is auto-installed via the streamable-HTTP transport (see the install options above) — no separate setup is required.

## Available Skills

| Skill | Purpose |
|---|---|
| [`accounts`](skills/accounts/SKILL.md) | Find Realize accounts and capture the `account_id` every other tool needs |
| [`campaigns`](skills/campaigns/SKILL.md) | List and inspect campaigns and their creatives |
| [`discovery`](skills/discovery/SKILL.md) | Look up targeting metadata, audiences, publishers, conversion rules, time zones, and CTA types — resolves opaque IDs before campaign work |
| [`reports`](skills/reports/SKILL.md) | Pull the four Realize performance reports and interpret the CSV output |
| [`optimize-campaign`](skills/optimize-campaign/SKILL.md) | Diagnose underperforming campaigns against the toolkit's signal-quality thresholds (100+ clicks per item, daily spend ≥ 8× CPA goal, 7–14 day learning phase) and prescribe concrete actions (most now applied via `manage-campaigns`) |
| [`manage-campaigns`](skills/manage-campaigns/SKILL.md) | Create and update campaigns and Native + Display items. Tiered preview-and-confirm pattern surfaces the target account on every write. Falls back to a UI reference for actions not supported here (delete, duplicate, bulk ops, Custom Rules, conversion-rule creation, CRM uploads) |
| [`support`](skills/support/SKILL.md) | Package the conversation into one file you can email to Taboola Support — see [`/realize-plugin:support`](#getting-help-with-a-problem) |

**Start with a skill, not the MCP** — the skills carry the account-resolution rules, CSV conventions, optimization playbook, and write-preview gate that raw MCP calls bypass. The [`realize-analyst`](agents/realize-analyst.md) agent auto-routes natural-language questions to the right skill, or you can invoke one explicitly (e.g. `/realize-plugin:optimize-campaign`). The most common miss: treating "performance review" or "insights" as ad-hoc analysis when it belongs in `optimize-campaign`.

## Natural-language examples

```
"List my Realize accounts."
"Show me the active campaigns for Acme."
"Which content drove the most spend in the last 7 days?"
"Break down spend by campaign for the last 30 days."
"Why is CPC up on campaign 12345 this week?"
"Show me the top 50 site/day rows for campaign 12345."

# optimization
"My campaign 12345 is burning budget with no conversions — what should I do?"
"Which items on campaign 67890 should I pause?"
"Which sites are wasting my spend this month?"
"My CPA doubled over the last two weeks. Help me diagnose."

# discovery (look up IDs / catalogs)
"What audiences are available for this account?"
"List all DMAs in the US."
"Show me publishers matching 'news' on this account."
"What time zones does Realize support?"
"What CTA button types exist for native items?"

# setup (preview-then-confirm before any write)
"Create a new Online Purchases campaign with a $25 CPA target."
"Bump the daily budget on campaign 12345 to $500."
"Also target Canada on campaign 12345."
"Pause item 887003."
```

## Configuration Reference

### `.mcp.json` (shipped with the plugin)
Points Claude Code at the remote Realize MCP. Usually nothing to edit.

### `.claude/realize.local.md` (optional, gitignored)
Persist a default account between sessions:

```yaml
---
default_account_id: advertiser_12345_prod
default_account_name: Example Advertiser
---
```

The `accounts` skill offers to write this for you.

## Troubleshooting

**OAuth browser doesn't open.**
Ensure port `3000` is free (the MCP transport uses it for the OAuth callback). Close any lingering process and retry.

**`search_accounts` returns nothing.**
Confirm you logged in to the correct Taboola SSO realm. If your org uses a non-default tenant, contact your Taboola account rep.

**Reports come back with `Records: 0`.**
The query window genuinely had no data, or you queried a campaign that didn't run in that window. Widen the date range or re-verify the `campaign_id`.

**What format are `account_id`, `campaign_id`, and `item_id` in?**
All three are **opaque identifiers** returned by the API. `account_id` is a string (e.g., `advertiser_12345_prod`) returned exclusively by `search_accounts`. `campaign_id` and `item_id` come from campaign/item tools. Pass them to follow-up calls exactly as received — don't reformat or coerce to numbers.

**The plugin tried to create a campaign and failed.**
Claude routes write-intent requests to the `manage-campaigns` skill, which previews the resolved payload (and the target account) and asks for confirmation before submitting. Delete, duplicate, and bulk operations aren't supported here yet — those fall back to the Realize UI. If Claude attempted something unexpected, run `/realize-plugin:support` to capture the transcript, then [file an issue](https://github.com/taboola/realize-claude-plugin/issues) with that file attached.

**A write went to the wrong account.**
Every write preview must lead with `▶ WRITE TARGET: <account name> (<account id>)`. If you saw the wrong account in that header before approving, the issue is at the account-resolution step — re-run the `accounts` skill to confirm the right account is selected before retrying. If the header was missing entirely, that's a bug — run `/realize-plugin:support` and send the resulting file to Support@taboola.com.

**CSV output was truncated.**
Very large result sets are auto-truncated server-side. Narrow the query (shorter date range, specific `campaign_id`, higher sort discrimination) and retry.

---

## Support

### Getting help with a problem

These conversations happen in your terminal, so Taboola Support can't see them. If the plugin gave you a wrong answer or you're stuck, run:

```
/realize-plugin:support
```

Optionally describe the problem in the same line:

```
/realize-plugin:support the CPA it reported doesn't match what I see in the Realize UI
```

You'll get a preview of what will be captured. Once you confirm, it saves a single Markdown file to your Desktop containing the full conversation — every question you asked, every action the plugin took, and every response it got back — plus a summary of which tools and guidance were used, and the account IDs involved.

**Email it to [Support@taboola.com](mailto:Support@taboola.com).** The file opens with a "How to send this" section giving you the three pieces:

| Email part | What to use |
|---|---|
| Subject | The copy-ready line at the top of the file (your own description of the problem) |
| Body | **Section 1. Summary** — copy it as-is |
| Attachment | The file itself, so Support gets the failed actions and full transcript |

Subject and body are separated because Taboola's case system reads them into different fields — the subject becomes the case Subject, the body becomes the case Description.

Why the whole transcript rather than a summary: if the plugin misread your question, a summary written by that same plugin would repeat the misreading. The raw exchange lets Support see what actually happened.

**Your data:** nothing is sent anywhere automatically — the file is saved locally and emailing it is your decision. Credentials and tokens are stripped out. Account, campaign, and item IDs are deliberately kept, since Support can't reproduce an issue without them. The file also contains the campaign data shown in the session and your local folder paths; the preview tells you this before anything is written.

### Bugs and feature requests

For product or security concerns, bug reports, and feature requests, open an issue at
[github.com/taboola/realize-claude-plugin/issues](https://github.com/taboola/realize-claude-plugin/issues).

---

## Privacy & Data Handling

Realize Plugin accesses the Realize MCP using your OAuth credentials and returns data only to your connected MCP client. Information processed in connection with your use of Realize Plugin is handled in accordance with the [Taboola Privacy Policy](https://policies.taboola.com/privacy-policy/).

---

## License

Licensed under the Apache License 2.0. See [LICENSE](LICENSE) for details.

---

## Contributing

Issues and PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).
