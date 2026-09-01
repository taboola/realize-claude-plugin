# Tests

This directory contains a **manual QA checklist** for the Realize plugin. There is no automated harness — these scenarios are meant to be run by a human against a real Realize test account to verify end-to-end behavior.

## Prerequisites

1. Claude Code installed (`claude --version` works).
2. A Realize account (ideally a **test** or sandbox account — see Gotchas).
3. This plugin installed or loaded locally (see root [README](../README.md)).
4. Network access to `https://mcp.realize.com/mcp`.

## Files

- [`test-scenarios-read.md`](./test-scenarios-read.md) — read-only paths. Safe against any account.
- [`test-scenarios-write.md`](./test-scenarios-write.md) — destructive paths. Mutate live Realize state. Require the team's designated test account, explicitly named at the start of the run.

## How to run

1. Open a Claude Code session in a directory where this plugin is active.
2. Pick the right file (reads vs writes — they have different account requirements).
3. For each scenario, type the **User prompt** into Claude Code and verify the **Expected behavior** matches.
4. Check off each scenario as it passes. If one fails, file an issue with:
   - File + scenario number and title
   - Actual vs. expected behavior
   - Any error output
   - Claude Code version (`claude --version`)

## Gotchas

- **Use a test account for writes.** Realize has no separate non-prod environment — every account lives on production. The team designates a real prod account for QA writes (named in `test-scenarios-write.md`); never run those scenarios against any other account. Read scenarios are safe against any account but still subject to rate limits.
- **OAuth on first run.** Scenario 1 triggers an interactive browser-based OAuth flow. Have your Taboola SSO credentials ready.
- **Date windows.** Scenarios that reference relative dates ("last week") depend on your test account having data in that window. Adjust dates if your test account is empty.
- **CSV report truncation.** Very large result sets may be truncated server-side. If a report shows a `⚠️ TRUNCATED` banner or returns fewer rows than expected, narrow the query (shorter window, tighter filter, smaller `page_size`).
