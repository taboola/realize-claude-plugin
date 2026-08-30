# Install the Realize Plugin

## Prerequisites
- [Claude Code](https://claude.ai/claude-code) CLI installed (`claude --version` works).
- A Realize account (Taboola SSO).
- Network access to `https://mcp.realize.com/mcp`.
- Port `3000` free locally for the OAuth callback (see [OAuth & the callback port](#oauth--the-callback-port) below).

---

## Install — marketplace path *(recommended)*

Run these **inside a Claude Code session at the prompt** (they are slash commands, not shell commands):

```
/plugin marketplace add anthropic/claude-plugins-community
/plugin install realize-plugin@claude-community
```

The first command registers the community marketplace with your CLI; the second installs the plugin from it. Installing the plugin brings its skills, the `realize-analyst` agent, and the Realize MCP wiring — no separate MCP setup required.

On your first Realize tool call, your browser opens for Taboola SSO. After sign-in, you can run prompts.

---

## Install — local-dev path *(contributors)*

Use this to iterate on skills, run test scenarios, or work in a restricted/air-gapped environment. Clone the repo and launch Claude Code with `--plugin-dir`:

```bash
git clone https://github.com/taboola/realize-claude-plugin
cd realize-claude-plugin
claude --plugin-dir .
```

`--plugin-dir` loads the plugin (skills, agent, and MCP wiring) directly from the local directory — no marketplace required.

> **The path is relative to where you launch `claude`.** From *inside* the repo use `--plugin-dir .`; from the parent folder use `--plugin-dir ./realize-claude-plugin`. A path that doesn't exist loads **nothing and prints no error** — the session starts normally and every plugin command comes back as `Unknown command`.
>
> Check it loaded before doing anything else:
>
> ```bash
> claude --plugin-dir . plugin list
> ```
>
> You want a `realize-plugin@inline … Status: ✔ loaded` entry. To see which skills and commands registered:
>
> ```bash
> claude --plugin-dir . plugin details realize-plugin@inline
> ```

**Invoking commands:** plugin components are namespaced by plugin name, so the support command is `/realize-plugin:support`, not `/support`. Typing `/` lists everything available in the session.

**Picking up code changes:** after `git pull`, run `/reload-plugins` inside the session to refresh without restarting the CLI.

**Loading multiple plugins at once:** repeat the flag, e.g. `claude --plugin-dir ./realize-claude-plugin --plugin-dir ./other-plugin`.

---

## First run

After install, test with a read prompt:

```
List my Realize accounts.
```

If accounts come back, the install is good.

---

## OAuth & the callback port

The Realize OAuth flow requires a **stable localhost redirect on port `3000`**. The bundled `.mcp.json` sets `oauth.callbackPort: 3000` for this reason. If authentication fails with a port/redirect error (the callback lands on a random port such as `11337`), register the MCP server manually with the correct port from your shell:

```bash
claude mcp remove realize-mcp
claude mcp add --transport http --callback-port 3000 realize-mcp https://mcp.realize.com/mcp
```

Then retry the OAuth flow. This forces the port-3000 redirect the Taboola auth server expects.

---

## Optional: opt in to skip the permission prompt for write tools

By default, the first call to each of the 6 Realize write tools (`create_campaign`, `update_campaign`, `create_native_item`, `update_native_item`, `create_display_item`, `update_display_item`) triggers a Claude Code permission prompt. This is **defense in depth on top of** the plugin's own preview-then-confirm gate (see [`os/guardrails.md`](os/guardrails.md) → "Write tool gate"). Both checks are recommended.

If you want to skip the harness-level prompt locally (the plugin gate still fires on every write), copy the example file into place:

```bash
cp .claude/settings.local.json.example .claude/settings.local.json
```

`settings.local.json` is gitignored — it is a per-user opt-in and is **not** shipped with the repo.

## Recommended: allow the public-documentation lookup

The same example file allows the two tools the plugin uses to answer questions its knowledge base doesn't cover:

```json
"WebSearch",
"WebFetch(domain:realize.com)",
"WebFetch(domain:www.realize.com)"
```

Without these, every lookup raises a permission prompt — and a declined prompt is indistinguishable from the plugin simply not knowing the answer. Lookups are read-only, restricted to Taboola's public advertiser help documentation, and never touch account data.

---

## Install on Codex (experimental)

> **Status:** the `.codex-plugin/` manifest exists in the repo but Codex support is not yet validated. Treat this section as a starting point; confirm the MCP URL/port for your Codex deployment before relying on it.

The Codex build wires the Realize remote MCP and ships the system-prompt + knowledge layer. The Claude Code skills (campaign creation workflows, optimization diagnostics, report aggregation) are not loaded on Codex; the **write tool gate is defined in [`os/guardrails.md`](os/guardrails.md)** so it applies on Codex too.

Two things differ from the Claude Code install:

1. **Manifest name.** Codex loads `.codex-plugin/plugin.json`, where the plugin is registered as `realize-plugin`. When installing into a Codex marketplace, use `realize-plugin` as the plugin slug.
2. **MCP URL / port.** The shared `.mcp.json` points at `https://mcp.realize.com/mcp` with OAuth callback port `3000`. The Codex build inherits this endpoint by default. Confirm with the Realize team whether your Codex deployment uses the same endpoint before installing — if Codex routes the realize-mcp differently, do not modify the shared `.mcp.json`; raise it with the Realize team for guidance on the correct override mechanism for your Codex environment.

After install, run a read prompt the same as on Claude Code:

```
List my Realize accounts.
```

If a write is attempted on Codex, the preview-then-confirm gate from `os/guardrails.md` fires identically — no skill is required.

---

## Troubleshooting

- **Browser didn't open / OAuth failed on the wrong port** → free port `3000` and re-register the MCP with `--callback-port 3000` (see [OAuth & the callback port](#oauth--the-callback-port)), then retry.
- **`search_accounts` returns nothing** → wrong SSO realm; check your Taboola login.
- **Wrong account in a write preview** → re-run the `accounts` skill before retrying.
- **`/plugin install` says "unknown marketplace"** → run `/plugin marketplace add anthropic/claude-plugins-community` first, then install.
- **Changes to a local plugin aren't visible** → run `/reload-plugins` inside the session.

Full docs: [README.md](README.md) · Claude Code plugin docs: https://code.claude.com/docs/en/plugins
