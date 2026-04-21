#!/usr/bin/env bash
set -euo pipefail

# Solana Claude Config Installer
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/solanabr/solana-claude-config/main/install.sh | bash
#   bash install.sh /path/to/project
#   bash install.sh --agents /path/to/project   # installs into .agents/ instead of .claude/

REPO_URL="https://github.com/solanabr/solana-claude-config.git"
SCRIPT_VERSION="dev"

# Resolve latest tagged release; fall back to main
LATEST_TAG=$(git ls-remote --tags --sort=-v:refname "$REPO_URL" 'refs/tags/v*' 2>/dev/null \
  | head -1 | sed 's|.*refs/tags/||; s|\^{}||')
BRANCH="${LATEST_TAG:-main}"

# Parse flags
AGENTS_ONLY=false
TARGET_ARG=""
for arg in "$@"; do
  case "$arg" in
    --agents) AGENTS_ONLY=true ;;
    *) TARGET_ARG="$arg" ;;
  esac
done

TARGET_DIR="${TARGET_ARG:-.}"
mkdir -p "$TARGET_DIR"
TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"

# Set config directory name based on flag
if [ "$AGENTS_ONLY" = true ]; then
  CONFIG_DIR=".agents"
else
  CONFIG_DIR=".claude"
fi

TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT

# Support local source for testing: SOLANA_CLAUDE_LOCAL_SRC=/path/to/repo
if [ -n "${SOLANA_CLAUDE_LOCAL_SRC:-}" ] && [ -d "$SOLANA_CLAUDE_LOCAL_SRC/.claude" ]; then
  echo "Using local source: $SOLANA_CLAUDE_LOCAL_SRC"
  mkdir -p "$TEMP_DIR/repo"
  cp -r "$SOLANA_CLAUDE_LOCAL_SRC/.claude" "$TEMP_DIR/repo/.claude"
  cp "$SOLANA_CLAUDE_LOCAL_SRC/CLAUDE-solana.md" "$TEMP_DIR/repo/CLAUDE-solana.md"
  [ -f "$SOLANA_CLAUDE_LOCAL_SRC/.mcp.json" ] && cp "$SOLANA_CLAUDE_LOCAL_SRC/.mcp.json" "$TEMP_DIR/repo/.mcp.json"
  [ -f "$SOLANA_CLAUDE_LOCAL_SRC/.env.example" ] && cp "$SOLANA_CLAUDE_LOCAL_SRC/.env.example" "$TEMP_DIR/repo/.env.example"
  [ -f "$SOLANA_CLAUDE_LOCAL_SRC/.gitmodules" ] && cp "$SOLANA_CLAUDE_LOCAL_SRC/.gitmodules" "$TEMP_DIR/repo/.gitmodules"
  [ -f "$SOLANA_CLAUDE_LOCAL_SRC/.claude/VERSION" ] && cp "$SOLANA_CLAUDE_LOCAL_SRC/.claude/VERSION" "$TEMP_DIR/repo/.claude/VERSION"
  # CHANGELOG.md stays in the repo — not shipped to user projects
else
  # Clone repo with submodules
  echo "Cloning repository..."
  git clone --recurse-submodules --depth 1 --branch "$BRANCH" "$REPO_URL" "$TEMP_DIR/repo" 2>&1 | tail -1 || true
fi

# Read version from source
[ -f "$TEMP_DIR/repo/.claude/VERSION" ] && SCRIPT_VERSION="$(awk '{print $NF}' "$TEMP_DIR/repo/.claude/VERSION")"

echo "Installing Solana Claude Config v$SCRIPT_VERSION to: $TARGET_DIR ($CONFIG_DIR/)"

# Copy .claude/ as $CONFIG_DIR (selective — protects user files)
echo "Copying $CONFIG_DIR/ configuration..."
mkdir -p "$TARGET_DIR/$CONFIG_DIR"

if [ -d "$TARGET_DIR/$CONFIG_DIR/agents" ]; then
  echo "Warning: $CONFIG_DIR/ already exists, merging..."
fi

# Directories: always overwrite with upstream (same as update.sh)
for dir in agents skills rules commands bin; do
  if [ -d "$TEMP_DIR/repo/.claude/$dir" ]; then
    cp -r "$TEMP_DIR/repo/.claude/$dir" "$TARGET_DIR/$CONFIG_DIR/"
  fi
done

# VERSION: always overwrite (CHANGELOG stays in source repo only)
[ -f "$TEMP_DIR/repo/.claude/VERSION" ] && cp "$TEMP_DIR/repo/.claude/VERSION" "$TARGET_DIR/$CONFIG_DIR/VERSION"

# Protected files: only copy if target doesn't exist yet
if [ -f "$TEMP_DIR/repo/.claude/settings.json" ] && [ ! -f "$TARGET_DIR/$CONFIG_DIR/settings.json" ]; then
  cp "$TEMP_DIR/repo/.claude/settings.json" "$TARGET_DIR/$CONFIG_DIR/settings.json"
fi

# MCP config: lives at project root as .mcp.json (Claude Code only reads this path)
if [ -f "$TEMP_DIR/repo/.mcp.json" ] && [ ! -f "$TARGET_DIR/.mcp.json" ]; then
  cp "$TEMP_DIR/repo/.mcp.json" "$TARGET_DIR/.mcp.json"
fi

# Copy CLAUDE-solana.md as CLAUDE.md
echo "Copying CLAUDE.md..."
if [ -f "$TARGET_DIR/CLAUDE.md" ]; then
  echo "Warning: CLAUDE.md already exists, backing up to CLAUDE.md.bak"
  cp "$TARGET_DIR/CLAUDE.md" "$TARGET_DIR/CLAUDE.md.bak"
fi
cp "$TEMP_DIR/repo/CLAUDE-solana.md" "$TARGET_DIR/CLAUDE.md"

# Merge .gitmodules (don't overwrite — user may have their own submodules)
if [ -f "$TEMP_DIR/repo/.gitmodules" ]; then
  if [ ! -f "$TARGET_DIR/.gitmodules" ]; then
    cp "$TEMP_DIR/repo/.gitmodules" "$TARGET_DIR/.gitmodules"
  else
    # Append submodule entries that don't already exist in target
    while IFS= read -r line; do
      if [[ "$line" =~ ^\[submodule\ \"(.+)\"\] ]]; then
        submod="${BASH_REMATCH[1]}"
        if ! grep -qF "[submodule \"$submod\"]" "$TARGET_DIR/.gitmodules"; then
          echo "" >> "$TARGET_DIR/.gitmodules"
          echo "$line" >> "$TARGET_DIR/.gitmodules"
          # Read and append path + url lines
          while IFS= read -r detail; do
            [[ "$detail" =~ ^\[submodule ]] && break
            [ -n "$detail" ] && echo "$detail" >> "$TARGET_DIR/.gitmodules"
          done
        fi
      fi
    done < "$TEMP_DIR/repo/.gitmodules"
  fi
fi

# Initialize submodules in target
echo "Initializing submodules..."
(cd "$TARGET_DIR" && git submodule update --init --recursive 2>/dev/null) || echo "Note: Submodule init skipped (not a git repo or submodules already set up)"

# Add $CONFIG_DIR/skills/ext/ to .gitignore if not present
GITIGNORE="$TARGET_DIR/.gitignore"
EXT_PATTERN="$CONFIG_DIR/skills/ext/"
if [ -f "$GITIGNORE" ]; then
  if ! grep -qF "$EXT_PATTERN" "$GITIGNORE"; then
    echo "" >> "$GITIGNORE"
    echo "# External Claude skill submodules" >> "$GITIGNORE"
    echo "$EXT_PATTERN" >> "$GITIGNORE"
    echo "Added $EXT_PATTERN to .gitignore"
  fi
else
  echo "# External Claude skill submodules" > "$GITIGNORE"
  echo "$EXT_PATTERN" >> "$GITIGNORE"
  echo "Created .gitignore with $EXT_PATTERN"
fi

# Add CLAUDE.local.md to .gitignore (Claude creates it organically when needed)
if ! grep -qF "CLAUDE.local.md" "$GITIGNORE"; then
  echo "CLAUDE.local.md" >> "$GITIGNORE"
fi

# Merge .env.example (append-only — preserves user edits on reinstall)
# shellcheck source=.claude/bin/_env_merge.sh
source "$TEMP_DIR/repo/.claude/bin/_env_merge.sh"
if [ -f "$TEMP_DIR/repo/.env.example" ]; then
  merge_env_file "$TEMP_DIR/repo/.env.example" "$TARGET_DIR/.env.example"
  if [ ! -f "$TARGET_DIR/.env" ]; then
    cp "$TARGET_DIR/.env.example" "$TARGET_DIR/.env"
    echo "Created .env from .env.example"
  else
    # Append new keys (with empty values) to existing .env
    merge_env_file "$TEMP_DIR/repo/.env.example" "$TARGET_DIR/.env"
  fi
fi

echo ""
echo "Installation complete!"
echo ""
echo "Next steps:"
echo "  1. cd $TARGET_DIR"
echo "  2. Edit .env to add your API keys (Helius, RPC, etc.)"
echo "  3. Run 'claude' to start Claude Code with Solana config"
echo "  4. Try /build-program or /audit-solana commands"
if [ "$AGENTS_ONLY" = true ]; then
  echo ""
  echo "Note: Installed into $CONFIG_DIR/ (--agents mode)."
  echo "The .md files also work as system prompts or context for any AI tool"
  echo "(Cursor, Windsurf, Copilot, etc.)."
fi
