#!/usr/bin/env bash
set -euo pipefail

# DEPRECATED: Use '/update' command or 'bash .claude/bin/update.sh' instead.
echo "⚠️  update.sh is deprecated. Use '/update' command or 'bash .claude/bin/update.sh' instead."
echo ""

if [ -f ".claude/bin/update.sh" ]; then
  exec bash .claude/bin/update.sh "$@"
else
  echo "Error: .claude/bin/update.sh not found. Run install.sh first."
  exit 1
fi
