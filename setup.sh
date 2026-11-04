#!/usr/bin/env bash
# Explore Katsina: re-runnable setup script.
# Phase 1: checks prerequisites only. Later phases add WordPress, plugins, settings, pages and sample data.
set -euo pipefail

ok()   { printf '  \033[32m✔\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✘\033[0m %s\n' "$1"; MISSING=1; }
MISSING=0

echo "Checking prerequisites..."
command -v node >/dev/null && ok "Node.js $(node -v)" || fail "Node.js not found (install from https://nodejs.org, version 18 or newer)"
command -v npm  >/dev/null && ok "npm $(npm -v)"     || fail "npm not found"
if command -v docker >/dev/null; then
  if docker info >/dev/null 2>&1; then ok "Docker is running"; else fail "Docker is installed but not running. Start Docker Desktop"; fi
else
  fail "Docker not found. Install Docker Desktop, or use LocalWP (https://localwp.com) instead"
fi

if [ "$MISSING" -ne 0 ]; then
  echo "Some prerequisites are missing (see above)."; exit 1
fi
echo "All prerequisites found. (WordPress setup steps are added from Phase 2 onward.)"
