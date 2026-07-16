#!/usr/bin/env bash
# realize-ads-api — auto-install the hosted Realize MCP server.
#
# Runs at SessionStart via .claude/settings.json. Idempotent.
#
# Prerequisites:
#   - bash (the script uses bash-specific features; on Windows, install Git Bash
#     or run under WSL — the .claude/settings.json hook invokes `bash` directly).
#   - The Claude Code `claude` CLI on PATH (the script no-ops with a warning if not).
#
# Behavior:
#   - If `realize-mcp` MCP server is MISSING from local config -> install with
#     --callback-port 3000 against https://mcp.realize.com/mcp.
#   - If present with the right URL + callback_port 3000 -> silent no-op.
#   - If present but URL or callback_port differ -> print a one-line warning
#     and DO NOT auto-repair (respects deliberate user customization).
#
# Why callback_port 3000 matters: the Realize OAuth flow expects a stable
# localhost redirect-URI. A random ephemeral port breaks the registered
# redirect with the Taboola auth server (invalid_request / invalid_target on
# the callback).
#
# The server name `realize-mcp` matches the public plugin's .mcp.json. All
# SKILL.md / agent tool references use the `mcp__realize-mcp__*` prefix.

set -u

DESIRED_URL="https://mcp.realize.com/mcp"
DESIRED_PORT="3000"
SERVER_NAME="realize-mcp"

# Outgoing client-identity header, mirrored from .mcp.json's `headers` block so
# CLI-installed sessions match plugin-provided ones. Version's single source of
# truth is .claude-plugin/plugin.json; fall back to a literal if it can't be read.
PLUGIN_JSON="$(dirname "$0")/../.claude-plugin/plugin.json"
DESIRED_VERSION="$(grep -oE '"version"[[:space:]]*:[[:space:]]*"[^"]+"' "$PLUGIN_JSON" 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || true)"
DESIRED_VERSION="${DESIRED_VERSION:-0.3.0}"
CLIENT_HEADER="X-Realize-Client: realize-mcp-plugin/${DESIRED_VERSION}"

# Don't break the session if `claude` isn't on PATH for some reason.
if ! command -v claude >/dev/null 2>&1; then
    echo "[ensure-realize-mcp] 'claude' CLI not on PATH; skipping auto-install." >&2
    exit 0
fi

current=$(claude mcp get "$SERVER_NAME" 2>&1 || true)

if echo "$current" | grep -qiE "(no MCP server|not found|does not exist)"; then
    echo "[ensure-realize-mcp] installing Realize MCP server (callback port $DESIRED_PORT)..."
    if claude mcp add --transport http --header "$CLIENT_HEADER" --callback-port "$DESIRED_PORT" "$SERVER_NAME" "$DESIRED_URL"; then
        echo "[ensure-realize-mcp] installed. Run '/mcp' to authenticate."
    else
        echo "[ensure-realize-mcp] install failed; run manually: claude mcp add --transport http --header \"$CLIENT_HEADER\" --callback-port $DESIRED_PORT $SERVER_NAME $DESIRED_URL" >&2
    fi
    exit 0
fi

has_url=$(echo "$current" | grep -c "URL: $DESIRED_URL" || true)
has_port=$(echo "$current" | grep -c "callback_port $DESIRED_PORT" || true)

if [ "$has_url" -ge 1 ] && [ "$has_port" -ge 1 ]; then
    exit 0
fi

# Customization mismatch — one-line warning by default. Set ENSURE_REALIZE_MCP_VERBOSE=1
# to surface the full expected/current/reset-command block.
if [ "${ENSURE_REALIZE_MCP_VERBOSE:-0}" = "1" ]; then
    echo "[ensure-realize-mcp] WARNING: realize MCP URL or callback_port differs from the repo default; not auto-repairing." >&2
    echo "[ensure-realize-mcp]   expected: URL=$DESIRED_URL, callback_port=$DESIRED_PORT" >&2
    echo "[ensure-realize-mcp]   current:" >&2
    echo "$current" | sed 's/^/[ensure-realize-mcp]     /' >&2
    echo "[ensure-realize-mcp]   reset:  claude mcp remove $SERVER_NAME -s local && claude mcp add --transport http --callback-port $DESIRED_PORT $SERVER_NAME $DESIRED_URL" >&2
else
    echo "[ensure-realize-mcp] WARNING: realize MCP URL or callback_port differs from repo default; not auto-repairing (set ENSURE_REALIZE_MCP_VERBOSE=1 for details)." >&2
fi
exit 0
