#!/bin/bash
# macOS Cowork 3P client uninstall script.
# Removes configuration, tokens, helper scripts, and clears caches.
#
# Usage:
#   ./uninstall-mac.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STORE_DIR="$HOME/.websearch-gw"
HEADERS_HELPER="/usr/local/bin/agentcore-token.sh"
CONFIG_LIBRARY="$HOME/Library/Application Support/Claude-3p/configLibrary"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
  echo -e "${GREEN}[INFO]${NC} $*"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $*"
}

log_section() {
  echo ""
  echo -e "${GREEN}=== $* ===${NC}"
  echo ""
}

read_confirm() {
  local prompt="$1"
  local response
  read -rp "$prompt (yes/no): " response
  [ "$response" = "yes" ]
}

log_section "Cowork 3P Client Uninstall (macOS)"

# Confirm uninstall
if ! read_confirm "This will remove all Cowork 3P configuration. Continue?"; then
  log_info "Uninstall cancelled"
  exit 0
fi

# Remove configuration store
if [ -d "$STORE_DIR" ]; then
  log_info "Removing configuration store: $STORE_DIR"
  rm -rf "$STORE_DIR"
fi

# Remove headersHelper
if [ -f "$HEADERS_HELPER" ]; then
  log_info "Removing headersHelper: $HEADERS_HELPER (requires sudo)"
  sudo rm -f "$HEADERS_HELPER" 2>/dev/null || log_warn "Could not remove $HEADERS_HELPER"
fi

# Remove managedMcpServers from configLibrary
if [ -d "$CONFIG_LIBRARY" ]; then
  log_info "Removing Cowork config library entries..."
  python3 << 'PYEOF'
import json
import os
from pathlib import Path

config_lib = Path("$CONFIG_LIBRARY")
if config_lib.is_dir():
    # Update all profile configs to remove managedMcpServers
    for profile_file in config_lib.glob("*.json"):
        if profile_file.name == "_meta.json":
            continue
        try:
            with open(profile_file) as f:
                profile = json.load(f)
            if "managedMcpServers" in profile:
                del profile["managedMcpServers"]
                with open(profile_file, "w") as f:
                    json.dump(profile, f, indent=2)
                print(f"Removed managedMcpServers from {profile_file.name}")
        except (json.JSONDecodeError, KeyError):
            pass
PYEOF
fi

# Clear caches
log_info "Clearing Cowork caches..."
rm -f "$HOME/Library/Application Support/Claude-3p/plugin-settings.json" 2>/dev/null || true
rm -f ~/.claude/mcp-needs-auth-cache.json 2>/dev/null || true
find "$HOME/Library/Application Support/Claude-3p/" -name ".credentials.json" -delete 2>/dev/null || true

security delete-generic-password -s "Claude Code-credentials" 2>/dev/null || true
security delete-generic-password -s "Claude-credentials" 2>/dev/null || true

log_section "Uninstall Complete"
echo ""
echo "Next steps:"
echo "  1. Restart Cowork (Cmd+Q, then reopen)"
echo "  2. The AgentCore Gateway connector will no longer appear"
echo ""

exit 0
