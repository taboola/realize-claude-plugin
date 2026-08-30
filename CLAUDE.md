# CLAUDE.md — Contributor Notes

Internal implementation notes for anyone (human or agent) editing this plugin. Not user-facing — the user-facing docs are in [README.md](README.md).

## Architecture at a glance

This is a thin Claude Code plugin that wraps the [Realize remote MCP](https://github.com/taboola/realize-mcp). The MCP does all the heavy lifting (auth, HTTP, response shaping); the plugin's job is to teach the model **how to use the MCP well**.

```
┌─────────────────────┐
│ User (Claude Code)  │
└──────────┬──────────┘
           │ natural language
           ▼
┌─────────────────────┐
│  realize-analyst    │  orchestrator agent (agents/realize-analyst.md)
│       agent         │  routes intent → right skill/tool
└──────────┬──────────┘
           │
           ├──► accounts skill        → search_accounts
           ├──► campaigns skill       → list_campaigns, get_campaign, list_items, get_item
           ├──► discovery skill       → search_geos, search_techno, search_audiences,
           │                            search_lookalike_audiences, search_contextual_segments,
           │                            search_publishers, search_conversion_rules,
           │                            list_time_zones, list_cta_types
           ├──► reports skill          → 4 report tools (CSV output)
           ├──► optimize-campaign skill → diagnoses underperformance; hands write
           │                              prescriptions to manage-campaigns
           ├──► manage-campaigns skill → 6 write tools: create_campaign, update_campaign,
           │                             create_native_item, update_native_item,
           │                             create_display_item, update_display_item.
           │                             Tiered preview-then-confirm with mandatory
           │                             ▶ WRITE TARGET account header.
           │                             UI fallback for delete/duplicate/bulk ops.
           │
           ├──► support skill  → NO MCP tools. Reads the local Claude Code
           │                             session transcript and renders one Markdown
           │                             file the user emails to Support@taboola.com.
           │                             Preview-then-confirm; writes locally only,
           │                             transmits nothing. Entry point: /support.
           │
           └──► web-fallback skill → NO MCP tools. WebSearch + WebFetch against
                                         realize.com/help/ only. Last tier of the
                                         sourcing ladder: fires only on a real
                                         per-question miss, never supplements, and
                                         loses silently to knowledge/ on conflict.
                     │
                     ▼
┌────────────────────────────────────────┐
│ Realize MCP (https://mcp.realize.com)  │
│  OAuth 2.1, 19 read + 6 write tools    │
│  wired here. Writes routed exclusively │
│  through the manage-campaigns skill.   │
└────────────────────────────────────────┘
```

## Key design decisions

### No hooks
This plugin does not use Claude Code hooks. The remote MCP handles token refresh at the transport layer, so adding hooks here would be overhead without benefit.

### The support bundle exports the transcript, never a summary
`support` is the one skill that touches no MCP tool. It reads the local Claude Code session transcript and renders it for Taboola Professional Services.

Everything in the bundle above the transcript — the Summary, the diagnostic table, the failed-action list, the ordered action log — is extracted **mechanically by the script**, not written by the model. This is deliberate and worth preserving: the bundle exists precisely for cases where the plugin got something wrong, and a model-authored summary of its own mistake reproduces the mistake. Don't "improve" this by having the model narrate what went wrong.

The model now authors **nothing** in the bundle. The case subject was the last model-written field and is now the user's complaint text (see *The Summary section is for PS's case Description* below).

Three constraints that are easy to break by accident:

- **Session identification uses `CLAUDE_CODE_SESSION_ID`.** A project folder normally holds several `.jsonl` sessions, so the newest-file fallback really can grab the wrong conversation. It exists only as a last resort and surfaces `confidence: guessed` when used — keep that surfaced.
- **Redaction strips credentials but keeps business IDs.** `account_id` / `campaign_id` / `item_id` are preserved on purpose; PS can't reproduce anything without them. Don't "harden" this by masking them.
- **No upload path, by design.** The script writes one local file and prints the path. Adding transmission would turn a local diagnostic into an outbound flow of customer campaign data — that's a privacy-review decision, not a refactor.
- **User text goes in by file, never as a shell argument.** `--complaint-file` / `--title-file` exist because a quoted shell argument silently rewrites the text: `$12.40` becomes `2.40`, `$500` becomes `00`, and backticks or `$(…)` execute. Currency is everywhere in this domain and users paste error text they didn't write. Collapsing this back to `--complaint "…"` for brevity reintroduces both the corruption and the injection.
- **Redact before shortening, and cover both value shapes.** Slicing first can cut a credential below the length the patterns match on. The actions table renders inputs as `key=value`, which a JSON-shaped pattern never matches — that gap leaked plaintext secrets in review.
- **Redaction targets credentials, not prose.** Where the parameter name is known, match on the key (`redactValue`); reserve pattern-matching for free text. An earlier regex that matched `secret:` / `authorization:` anywhere shredded legitimate ad copy — "Secret: Summer Sale" became "Secret: `<redacted>` Sale". Over-redaction destroys the evidence the bundle exists to carry, which is worse than the leak it guards.
- **The git-work-tree refusal is a control, not a suggestion.** `findGitRoot` blocks writes inside any repo. Customer data committed to this public repo is the worst outcome this feature can produce, and it is one bad `--out` away. Don't relax it to a warning.

  A `--allow-git` override exists for maintainers who need a bundle inside a checkout deliberately. It is **intentionally absent from the refusal message and from SKILL.md**: the model that hits the error reads that message as its next instruction, and the correct next step is a different path, not a bypass. Don't "improve" the error by naming the flag.

- **Realize tool results get a much larger truncation budget than other output** (`MAX_REALIZE_RESULT_CHARS` vs `MAX_RESULT_CHARS`). A report CSV usually *is* the case — "the CPA here disagrees with the UI" is answered by the rows behind the number. Under the old uniform 2,000-char cap only ~13 of 250 rows survived, so the disputed row was typically the one missing. Bulk output from other tools stays tightly capped so the bundle remains email-attachable.

### The Summary section is for PS's case Description
Requested by the PS manager, and shaped by the constraint above. Case intake copies an email's **subject into the case Subject** and its **body into the case Description**, so the bundle now renders:

- a copy-ready **subject** = the user's complaint, one line, capped at `MAX_SUBJECT_CHARS`, with the first account ID appended for triage;
- **§1 Summary** = `EMAIL_PROLOG` (*"This case has been created by the Realize Plugin…"*) followed by mechanically-extracted facts, which the user pastes as the email body.

The tempting mistake is to satisfy "we want a summary" with a model-written narrative. That is the exact thing the section above forbids, so §1 carries only counts, tool names, and file paths. What makes it genuinely useful to PS is the attribution: **which Realize tools ran, which skills were invoked, and which knowledge files were read.** That separates *"the plugin read the right guidance and still got it wrong"* from *"the plugin never read it"* — different bugs with different fixes, previously indistinguishable from the outside. `knowledgeRef` is deliberately narrow (only `knowledge/`, `os/`, `agents/`, `skills/**/SKILL.md`, `skills/**/references/`); widening it to every file touched turns a signal into noise.

It is also **anchored to the plugin root**, not pattern-matched anywhere in the path. Unanchored, a user's own `~/Documents/os/notes.md` was reported to PS as plugin guidance — worse than reporting nothing, because the section exists to answer "did it read the guidance?" and a false entry answers it wrongly. The root is derived from `__dirname`; `knowledgeRef` takes an injectable root so tests don't depend on the checkout location.

Two more traps in this area, both found in review:

- **The subject must not be squeezed out by its own suffix.** `account_id` is an opaque API string with no length bound. A `slice(0, MAX - suffix.length - 1)` goes negative on a long one and slices *from the end*, which replaced the entire complaint with a bare `…`. `MIN_SUBJECT_TEXT_CHARS` now guarantees the user's words win and the account suffix is dropped instead.
- **The complaint is redacted, not trusted.** It is the user's own prose, so it is never rewritten — but users paste error output they never read, and that string now travels into an email subject. `redact()` is safe to apply here precisely because its flat rule is `=`-only with a length floor, so sentences survive while `Bearer …` does not.

§1 also states in the file that it is mechanical and points at the transcript. Keep that line — it is what stops a reader treating the bullet list as the plugin's testimony about itself.

Run `node skills/support/scripts/test-build-bundle.js` after touching the script — CI runs it too. Add cases there rather than testing via inline `node -e`: the rules are dense with backslashes and dollar signs, and shell escaping produced two false results during review.

### The guardrails carve-out for `/support` is load-bearing
`os/guardrails.md` bans surfacing skill names, `@taboola.com` addresses, and local file paths. The escalation message needs all three, so *Internal tools, skills, and infrastructure — never reference* carries an explicit carve-out.

If you tighten those bans later, **re-check the carve-out** — without it the model silently stops offering `/support`, and the failure is invisible (a feature that quietly never fires, not an error). Scenario 18 in `tests/test-scenarios-read.md` is the regression test.

### The web fallback is a tier, not a second opinion

`web-fallback` is the last rung of the sourcing ladder in `os/guardrails.md`. Three properties make it safe, and each one is easy to erode:

- **It fires only on a real miss, judged per question.** The topic file existing is not coverage — `knowledge/tracking.md` answers "pixel or S2S?" and says nothing about installing on a storefront platform. Widening this to "supplement partial answers" is the tempting change and the wrong one: once web content tops up good answers, the curated guidance stops being what users hear, and the staleness problem the tiering exists to prevent arrives through the front door.
- **On conflict the knowledge base wins, silently.** Help articles lag the platform. Don't "improve" this by noting the disagreement — that just points the user at the outdated answer.
- **The source is not named unless asked.** The answer discloses that it came from outside the plugin, which is the honest part; *which* page is not volunteered. Requested by design, and the reason `os/guardrails.md` needed a second carve-out.

Three implementation traps, all found by actually running the search rather than reasoning about it:

- **`WebSearch` appends its own instruction to its results** — a reminder that you *must* list the sources as markdown hyperlinks. It is retrieved text, not policy. Without an explicit override in the guardrails and the skill, the feature ships doing exactly what it was built not to do. Scenario 19A is the regression test.
- **A domain allowlist is not a path allowlist.** `realize.com` also serves `/marketing-hub/`, which supplied 3 of 10 hits in one live test search and 7 of 10 in another. That's promotional copy carrying the guaranteed-outcome framing `os/guardrails.md` bans and the legacy-category framing `scripts/brand-check.sh` fails on. Filter to `/help/` **before** reading anything.
- **The search tool's own summary defeats the path filter.** This is the subtle one. The tool synthesizes prose across *every* hit and hands it to you in the same result as the URL list — so filtering the links does not unread the pages you were filtering out. In a live run, a correctly domain-restricted query produced a summary that defined "pixel" from a marketing page and steered the reader toward other documentation instead of a help-center article. Hence the rule in both the guardrails and the skill: search results are a **link index**, and the answer must come from a fetched `/help/` article. Scenario 19F's tell is verifying the fetch actually happened.

Related: the `Sources:` footer ban in `os/guardrails.md` is deliberately scoped to *plugin internals* rather than being absolute. An absolute ban left the model resolving a contradiction the moment a user asked where an answer came from, and that resolves toward silence — a capability that quietly never fires. If you tighten it again, keep the public-URL exception.

**Taboola's developer documentation is deliberately excluded**, and the exclusion is reasoned, not an oversight: its API reference covers the same API the MCP already wraps (and *No direct curl / no API client code* below forbids emitting what's unique there), half its sections are publisher-side, and its one advertiser-relevant area is already better covered by the help center for a non-developer reader. Revisit only if users start asking S2S / pixel-event questions the help center can't answer.

### No direct curl / no API client code
All Realize API access flows through MCP tools. Do not add Bash curl calls that hit Realize endpoints directly — that bypasses the MCP's rate limiting, auth handling, and safety guarantees.

### Use only tools that actually exist upstream
The plugin's agent and skills must never fabricate tool calls. When a user requests an action that the current upstream MCP does not expose (e.g., deleting or duplicating a campaign — there are no MCP tools for those today), the `manage-campaigns` skill takes over with a UI fallback reference. When upstream adds new tools, update the agent's Tool Reference, wire the new tool into the most appropriate skill, and trim the `manage-campaigns` UI fallback for the steps that become automatable — in an explicit PR, not silently. **Write tools require special handling**: route them exclusively through `manage-campaigns` so the preview-then-confirm gate (and the mandatory `▶ WRITE TARGET` account header) cannot be bypassed.

### CSV, not JSON
Report tools return CSV. The leading metadata line (`Records: N | Total: M | Page: X | Size: Y`) is the primary pagination signal. Skills must cite `Total` in their summaries.

### All IDs are opaque strings from the API
Users often type numeric IDs in natural language. The MCP expects opaque string identifiers (e.g., `advertiser_12345_prod` for `account_id`) returned by its own tools. Every skill and the agent must route account lookups through `search_accounts` first and pass returned IDs through verbatim — no coercion to numbers, no re-casing, no stripping. This applies to `account_id`, `campaign_id`, and `item_id` alike.

## How to add a new skill

1. Create `skills/<skill-name>/SKILL.md` with the YAML frontmatter template:
   ```yaml
   ---
   name: <skill-name>
   description: <when to use, what it does>
   allowed-tools: ["Read", "Bash", "AskUserQuestion"]
   ---
   ```
2. Document: when to use, workflow, gotchas, example prompts.
3. If the skill wraps MCP tools, list them with one-liner descriptions.
4. Update [README.md](README.md) "Available Skills" table.
5. Add at least one scenario to [`tests/test-scenarios-read.md`](tests/test-scenarios-read.md) (read-only) or [`tests/test-scenarios-write.md`](tests/test-scenarios-write.md) (destructive — include side effects + cleanup).
6. Update [CHANGELOG.md](CHANGELOG.md) under the next unreleased version.

## How to sync with upstream MCP changes

When [taboola/realize-mcp](https://github.com/taboola/realize-mcp) ships a new version:

1. Diff the tool list in its README against our [`realize-analyst` tool reference](agents/realize-analyst.md).
2. If a tool is added:
   - Add it to the agent's Tool Reference section.
   - Route it into an existing skill (or create a new one).
   - Add a test scenario.
3. If a tool is removed or renamed:
   - Update the agent and skills.
   - Bump the minor version in [`plugin.json`](.claude-plugin/plugin.json) and note the breaking change in [CHANGELOG.md](CHANGELOG.md).
4. If **write tools** are added upstream: **do not silently enable them.** Open an issue first; adding writes changes the plugin's safety posture and needs explicit review. New write tools land in the `manage-campaigns` skill, behind the same tiered preview-then-confirm gate (with the mandatory `▶ WRITE TARGET` account header) — never routed via the agent directly. Add corresponding scenarios to `tests/test-scenarios-write.md` with explicit side effects and cleanup steps.

## Conventions

- Plugin `name` in `plugin.json`: `realize-plugin` (lowercase, hyphen-separated). Display name (`displayName`): `Realize Plugin`.
- Skill directory names: lowercase, hyphen-separated (`manage-campaigns`).
- Agent filenames: `<name>.md` matching the `name:` frontmatter.
- YAML frontmatter must be valid — CI validates this (`.github/workflows/validate.yml`).
- Never write user credentials or tokens to any tracked file. Local per-user state lives in `.claude/*.local.md` (gitignored).

## Repo layout

```
.
├── .claude-plugin/plugin.json     # plugin manifest
├── .mcp.json                      # remote Realize MCP wiring
├── .github/workflows/validate.yml # CI: JSON + YAML frontmatter checks
├── agents/                        # orchestrator(s)
├── skills/                        # domain skills
├── tests/                         # manual QA scenarios
└── <governance docs>              # README, CLAUDE, CHANGELOG, ...
```

## Open items

These are placeholders that should be updated by the repo maintainer before the first public release:

- **`SECURITY.md`** — replace `security@taboola.com` with the real disclosure address if it differs.
- **`plugin.json` `author`** — currently `"Taboola"`; specify a team or individual maintainer if desired.
- **`homepage` / `repository` URLs** — confirm the repo lives at `github.com/taboola/realize-claude-plugin` or update.
- **`CONTRIBUTING.md` contact line** — replace the `TODO: add team alias` comment with the real Realize team contact at Taboola.
