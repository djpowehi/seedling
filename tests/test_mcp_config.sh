#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

source "$SCRIPT_DIR/helpers.sh"

MCP_FILE="$REPO_ROOT/.mcp.json"
SETTINGS_FILE="$REPO_ROOT/.claude/settings.json"

echo "[test_mcp_config] Checking MCP configuration..."

# .mcp.json must be at project root (Claude Code only reads this path)
assert_file_exists "$MCP_FILE" ".mcp.json exists at project root"
assert_json_valid "$MCP_FILE" ".mcp.json is valid JSON"

# Ensure old location doesn't exist
if [ -f "$REPO_ROOT/.claude/mcp.json" ]; then
  assert_eq "0" "1" ".claude/mcp.json should not exist (wrong path — use .mcp.json at root)"
fi

# Check for mcpServers key
MCP_CONTENT="$(cat "$MCP_FILE")"
assert_contains "$MCP_CONTENT" '"mcpServers"' ".mcp.json has mcpServers key"

# Check expected server names
assert_contains "$MCP_CONTENT" '"helius"' ".mcp.json has helius server"
assert_contains "$MCP_CONTENT" '"context7"' ".mcp.json has context7 server"
assert_contains "$MCP_CONTENT" '"playwright"' ".mcp.json has playwright server"
assert_contains "$MCP_CONTENT" '"solana-dev"' ".mcp.json has solana-dev server"
assert_contains "$MCP_CONTENT" '"context-mode"' ".mcp.json has context-mode server"
assert_contains "$MCP_CONTENT" '"memsearch"' ".mcp.json has memsearch server"

# settings.json must enable project MCP servers (otherwise they stay pending)
SETTINGS_CONTENT="$(cat "$SETTINGS_FILE")"
assert_contains "$SETTINGS_CONTENT" '"enableAllProjectMcpServers"' "settings.json has enableAllProjectMcpServers"
assert_contains "$SETTINGS_CONTENT" '"enableAllProjectMcpServers": true' "enableAllProjectMcpServers is true"

# Check .env.example exists
ENV_EXAMPLE="$REPO_ROOT/.env.example"
assert_file_exists "$ENV_EXAMPLE" ".env.example exists"

print_summary
