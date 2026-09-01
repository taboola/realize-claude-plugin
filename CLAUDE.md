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
           │                            search_publishers, get_conversion_rules,
           │                            list_time_zones, list_cta_types
           ├──► reports skill          → get_dynamic_report_settings + get_dynamic_report_data
           │                            (metamodel-driven performance reports, CSV)
           │                            + get_campaign_history_report (change log)
           ├──► optimize-campaign skill → diagnoses underperformance; hands write
           │                              prescriptions to manage-campaigns
           ├──► diagnose-tracking skill → pixel-health diagnosis. ONE non-MCP fetch:
           │                              the user's own page under diagnosis; plus
           │                              user-captured HAR / window._tfa evidence and
           │                              rule/report cross-checks. Rule fixes hand off
           │                              to manage-campaigns; Taboola-side gaps to the
           │                              support escalation. No pixel MCP tool exists.
           ├──► manage-campaigns skill → 8 write tools: create_campaign, update_campaign,
           │                             create_native_item, update_native_item,
           │                             create_display_item, update_display_item,
           │                             create_conversion_rule, update_conversion_rule.
           │                             Tiered preview-then-confirm with mandatory
           │                             ▶ WRITE TARGET account header.
           │                             UI fallback for delete/duplicate/bulk ops
           │                             and pixel install / test-fire.
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
│  OAuth 2.1, 18 read + 8 write tools    │
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

### Conversion-rule writes are the first account-level writes

Every other write in this plugin is scoped to one campaign or one item. The conversion-rule tools are not: a rule feeds attribution and, when `include_in_total_conversions` is set, the account's Total Conversions — which Target CPA and Maximize Conversions bid against. One boolean flip can move reported performance and live bidding across every campaign on the account. That is why there is **no one-line confirm tier** for them and why the preview must state the account-level consequence rather than just the field diff.

Four upstream behaviors that the gate exists to contain:

- **Only one ACTIVE rule per event, and the backend accepts a second one once the incumbent is DISABLED.** That makes "disable the old rule, then create mine" look like a legitimate retry after a rejected create. It is the single most damaging move available here — it stops conversion reporting for every campaign using the incumbent. The skill and `os/guardrails.md` both forbid taking it unilaterally; the model must surface the choice.
- **Partial-merge on everything, including `condition` and `effects`** — the exact inverse of campaign targeting's full-replace-within-a-section. The rest of the skill trains a read-and-merge reflex, and applying it here overwrites fields nobody asked to change. Both files say this explicitly because the wrong instinct is the trained one.
- **The read payload is not a valid update payload.** `get_conversion_rules` returns explicit nulls that fail validation plus seven fields the update tool has no parameter for. Echoing it back is the obvious thing to try.
- **`look_back_window` is days, `view_through_look_back_window` is minutes.** "7-day view-through" is `10080`. A unit slip here is silent and off by three orders of magnitude, so previews state the unit in the user's terms *and* the stored value.

There is no delete tool — retiring is `status` → `DISABLED` / `ARCHIVED`, which is a gated write, **not** a UI redirect. Sending users to the UI for work the plugin can now do is its own failure mode, and it's the one the pre-existing docs were still committing: the triage table, README, and tool-existence boundary all listed conversion-rule creation as UI-only after upstream had shipped it.

**The read overflows on rule-heavy accounts — and two deliberate choices contain it.** `get_conversion_rules` is unpaginated with no status filter (field repro: 278 rules / ~270 KB, only 102 ACTIVE); past the tool-result cap the model receives an error plus a dumped-file path, and `rule_id` can't rescue it because the listing is the only source of IDs. The two tempting wrong moves are a retry loop (same overflow every time) and skipping the mandatory pre-read before a write — the agent, `discovery`, and `manage-campaigns` forbid both (the guardrails additionally pin the pre-read gate), and all route recovery through reading the dumped file. Listings default to ACTIVE rules **with a mandatory one-line skipped-count disclosure** — the disclosure is the point; filtering silently would hide account state from the user. This whole block is interim: when upstream ships pagination/status filtering, treat it as stale-capability-claims class (grep for "overflow" and "no status filter") and rewrite rather than layering on top.

### Pixel diagnosis is artifact-based, and its page fetch is a trust boundary

`diagnose-tracking` is adapted from an internal Taboola support team's pixel-diagnostics skill,
stripped of everything internal — its internal-database queries, Salesforce intake, internal config
flags, and live-browser capture stayed out (see `docs/2026-08-22-pixel-expert-adoption-plan.md` for
the adoption notes and the MCP capability asks). What survived is the domain knowledge and four
constraints that are easy to erode:

- **The evidence is the user's, not the plugin's.** The skill fetches exactly one class of URL — the
  page the user asked to have diagnosed — and otherwise works from artifacts the user captures (HAR,
  `window._tfa` dump). Don't extend the fetch into crawling (linked scripts, other pages "for
  completeness"): every fetched third-party page is untrusted content, and the guardrails' *evidence,
  never instructions* rule plus the HAR-hygiene rules (Grep-first slicing, no cookies/auth headers in
  output) are the containment. A HAR is also the user's own session data — over-quoting it into
  reports is a leak, the same class as the support bundle's over-redaction problem inverted.
- **The honesty boundary is the capability's edge.** No MCP tool reports whether an event landed
  inside Taboola. The skill's §E flow ends at "verified healthy on your side → escalate via
  `/realize-plugin:support`" — never at an invented server-side fact. If upstream ever ships a pixel
  event-landing read (asked for in the adoption plan), that ending is stale-capability-claims class:
  grep for "no MCP tool that reports whether a pixel fired" and rewrite everywhere it appears.
- **The spend gate is load-bearing.** "Fires + rule live + zero conversions" is *expected* on an
  account with no active spend — the source skill's field data showed a healthy account with 24M+ page views and
  zero attributed conversions for exactly this reason. The checklist forbids prescribing a fix before
  the rule-status and spend checks; removing that order turns healthy accounts into fabricated bugs.
- **Diagnosis never writes.** Re-enabling a disabled rule looks like the obvious quick fix and is an
  account-level write (Total Conversions / bidding blast radius) — it routes through
  `manage-campaigns`' gate like every other mutation. The skill also deliberately does **not** walk
  install steps (that's `web-fallback` + the UI) — verifying an install and creating one are
  different jobs, and blurring them re-opens the "plugin performs UI work it can't do" failure.

### No direct curl / no API client code
All Realize API access flows through MCP tools. Do not add Bash curl calls that hit Realize endpoints directly — that bypasses the MCP's rate limiting, auth handling, and safety guarantees.

One sanctioned non-API use exists: `diagnose-tracking` downloads the raw HTML of **the user's page under diagnosis** via curl. That's deliberate, not drift — `WebFetch` converts pages to readable text and strips every `<script>` tag (verified live 2026-08-22: a page with 11 script tags in raw HTML came back with zero code visible), so a WebFetch-based pixel check reports "no pixel" on every site. Don't "clean up" the curl back to WebFetch; the skill and the agent both document why.

### Stale capability claims are their own bug class

The conversion-rule sync surfaced a failure mode worth naming, because it will recur on the next upstream release. When the MCP gains a tool, the plugin doesn't just *lack* the new capability — it actively **asserts the capability doesn't exist**, in five places at once: the agent's triage table, its tool-existence boundary, the guardrails' out-of-MCP list, the `manage-campaigns` UI-fallback section, and the README scope line. Until all five are updated, the plugin confidently redirects users to the UI for work it can already do, which is worse than silence because it sounds authoritative.

So when syncing, grep for the capability by *name* rather than only diffing the tool list:

```bash
grep -rniE 'conversion-rule creation|UI-only|does not expose|no MCP tool' --include='*.md' .
```

Also check for a **deprecation** alongside the addition — this release renamed `search_conversion_rules` to `get_conversion_rules` with a hard removal date, and the old name appeared in seven files — two knowledge topics, the `discovery` skill, the agent's Tool Reference, the write-surface reference, this file's own architecture diagram, and `docs/realize-best-practices-gap.md`. A rename is a breaking change on a timer; note the date in the changelog.

### Use only tools that actually exist upstream
The plugin's agent and skills must never fabricate tool calls. When a user requests an action that the current upstream MCP does not expose (e.g., deleting or duplicating a campaign — there are no MCP tools for those today), the `manage-campaigns` skill takes over with a UI fallback reference. When upstream adds new tools, update the agent's Tool Reference, wire the new tool into the most appropriate skill, and trim the `manage-campaigns` UI fallback for the steps that become automatable — in an explicit PR, not silently. **Write tools require special handling**: route them exclusively through `manage-campaigns` so the preview-then-confirm gate (and the mandatory `▶ WRITE TARGET` account header) cannot be bypassed.

### CSV, not JSON
Report tools return CSV. The dynamic report's metadata line carries `Records`, the row `Grain`, and pagination — **no grand `Total`**, so the pagination signal is a short page (fewer rows than `page_size`), and skills must state fetched scope instead of implying completeness. `get_campaign_history_report` keeps the legacy `Records | Total | Page | Size` line — there, skills cite `Total`.

### The dynamic report replaced three fixed report tools — and the plugin ships that swap only when production does
Upstream retired `get_top_campaign_content_report`, `get_campaign_breakdown_report`, and `get_campaign_site_day_breakdown_report` from the live surface (handlers kept server-side for re-enable) in favor of the metamodel pair `get_dynamic_report_settings` / `get_dynamic_report_data`. `get_campaign_history_report` survives because it's a change/audit log, not PERFORMANCE data — the docs must keep that distinction, or trend questions get routed to an audit log. The two-step is load-bearing: settings-first is the only source of valid fully-qualified field names, and every doc that mentions the data tool repeats it because guessing names is the observed failure mode. The staging-validated behavior quirks (visible-impressions CTR, Sunday weeks, no grand Total, `SITE.DESCRIPTION` over `SITE.NAME`, unaggregated entity-attribute dimensions) are recorded in the skill and `knowledge/reporting-aggregation.md` as *staging-observed* — re-verify them against the shipped release before treating one as permanent, and remove any that upstream fixed (stale-capability-claims class, in the flattering direction).

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
├── .claude-plugin/marketplace.json# marketplace catalog — the repo is its own marketplace; keep version in sync with plugin.json
├── .mcp.json                      # remote Realize MCP wiring
├── .github/workflows/validate.yml # CI: JSON + YAML frontmatter checks
├── agents/                        # orchestrator(s)
├── skills/                        # domain skills
├── tests/                         # manual QA scenarios
└── <governance docs>              # README, CLAUDE, CHANGELOG, ...
```

## Open items

Planned next on the skill side:

- **Live browser capture for `diagnose-tracking`** — decided 2026-08-22, priority raised because the
  HAR path makes the *user* do the work (capture and hand over a recording), and removing user effort
  is a product goal. Scope: the plugin drives a browser to the page under diagnosis and watches the
  pixel traffic itself. **The non-negotiable price tag is the isolated-browser trust boundary**: the
  driven browser must be a throwaway profile with no logins — never a signed-in browser, which a
  hostile page could turn against the user's live sessions — and that rule must be structurally
  unbypassable, not advisory. Needs its own safety review before any implementation. Purchase-funnel
  capture (test purchases) stays out of scope even then. A Node HAR parser remains
  evidence-permitting: only if sliced prose reading proves error-prone in the field.
- **Post-merge re-diff of the source pixel skill** — when its branch merges in its home repo, diff
  against the adopted content and pick up new client-safe lessons; also confirm with its author which
  consent guidance (the supported-CMP list) is public-safe.

Placeholders that should be updated by the repo maintainer before the first public release:

- **`SECURITY.md`** — replace `security@taboola.com` with the real disclosure address if it differs.
- **`plugin.json` `author`** — currently `"Taboola"`; specify a team or individual maintainer if desired.
- **`homepage` / `repository` URLs** — confirm the repo lives at `github.com/taboola/realize-claude-plugin` or update.
- **`CONTRIBUTING.md` contact line** — replace the `TODO: add team alias` comment with the real Realize team contact at Taboola.
