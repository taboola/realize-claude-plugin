#!/usr/bin/env bash
# realize-ads-api — dynamic MCP request headers (Claude Code `headersHelper`).
#
# Claude Code runs this at each MCP connection and merges the JSON object it
# writes to stdout into the outgoing request headers. We use it to stamp an
# X-Realize-Client identity header whose version is read live from
# .claude-plugin/plugin.json — the single source of truth — so a version bump
# needs no edit here or in .mcp.json.
#
# Requires Claude Code v2.1.195+ (sets CLAUDE_PLUGIN_ROOT + cwd=plugin root for
# plugin-provided servers). Falls back to this script's own repo root when run
# outside a plugin context (e.g. via `--mcp-config` in a local test).
#
# Contract: MUST print a single JSON object of string key/value pairs, nothing
# else. 10-second timeout. Keep it dependency-free (no jq).

set -u

root="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
plugin_json="$root/.claude-plugin/plugin.json"

version="$(grep -oE '"version"[[:space:]]*:[[:space:]]*"[^"]+"' "$plugin_json" 2>/dev/null \
  | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || true)"
version="${version:-0.3.0}"

printf '{"X-Realize-Client":"realize-mcp-plugin/%s"}' "$version"
