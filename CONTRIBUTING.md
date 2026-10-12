# Contributing

Thanks for your interest in improving the Realize Plugin. Contributions of all shapes are welcome — bug reports, doc fixes, new skills, test scenarios, MCP sync PRs.

## Ground rules

- Be respectful and follow our [Code of Conduct](CODE_OF_CONDUCT.md).
- This plugin wraps the [Realize remote MCP](https://github.com/taboola/realize-mcp). If your change needs a new MCP tool or a behavioral change on the server side, open an issue on the MCP repo first.
- Do not add direct API calls to Realize from this plugin (no `curl`, no `httpx`). All data access flows through MCP tools — see [.claude/CLAUDE.md](.claude/CLAUDE.md) for the reasoning.
- Do not add code paths that call MCP tools that don't exist in the current upstream release. User-facing requests for actions not yet exposed as MCP tools (today: delete, duplicate, bulk operations) are handled by the `manage-campaigns` skill's UI fallback section. When upstream adds new write tools, wire them through `manage-campaigns` with an explicit PR — never route writes directly through the agent. New writes must inherit the tiered preview-then-confirm gate and the mandatory `▶ WRITE TARGET` account header.

## Before you start

1. Open an issue describing the change (or comment on an existing one). For small fixes — typos, broken links, CSV-example corrections — you can go straight to a PR.
2. Check that your change fits the plugin's scope: **analyst-style conversational workflows over Realize data**. Scope-expanding ideas (e.g., supporting a different ads product) belong in a separate plugin.

## Development workflow

1. Fork and branch from `main`.
2. Make your change. Keep PRs focused — one change per PR.
3. Update documentation:
   - New skill? Add a row to the README's "Available Skills" table and at least one test scenario in `tests/test-scenarios-read.md` (read-only paths) or `tests/test-scenarios-write.md` (destructive paths — include side effects + cleanup).
   - Changed behavior? Note it in `CHANGELOG.md` under the next unreleased version.
4. Verify locally:
   - `python -m json.tool < .claude-plugin/plugin.json` (valid JSON)
   - `python -m json.tool < .mcp.json` (valid JSON)
   - All `*.md` files in `agents/` and `skills/` have valid YAML frontmatter with a `name:` field.
5. Submit the PR with a description that covers **what**, **why**, and any user-facing impact.

## PR checklist

- [ ] Linked issue (if one exists)
- [ ] README updated (if user-facing)
- [ ] CHANGELOG entry added
- [ ] Frontmatter + JSON validates
- [ ] At least one test scenario touches the new behavior
- [ ] Any new MCP write tool routes through the `manage-campaigns` skill on Claude Code, and the preview-then-confirm gate in `os/guardrails.md` covers it for every runtime (Codex included)
- [ ] New write paths have a scenario in `tests/test-scenarios-write.md` with explicit side-effects + cleanup
- [ ] Pre-approval of new write tools stays out of the committed `.claude/settings.json` — per-user opt-in goes through the gitignored `.claude/settings.local.json` template instead
- [ ] No secrets, tokens, or account-specific data in committed files

## Contact

For questions that don't belong in an issue, email the Realize team at Taboola (TODO: add team alias before the first public release).
