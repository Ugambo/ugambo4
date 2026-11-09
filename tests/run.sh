#!/usr/bin/env bash
# Runs all automated checks against the local site (start it with ./setup.sh first).
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
if docker compose -f docker-compose.offline.yml ps --status running 2>/dev/null | grep -q wordpress; then
  wp() { docker compose -f docker-compose.offline.yml run --rm -T cli wp "$@"; }
else
  wp() { npx wp-env run cli wp "$@"; }
fi
echo "▶ Server-side security & logic checks"
wp eval-file ek-tests/phase2-security.php
wp eval-file ek-tests/phase3-hotels.php
wp eval-file ek-tests/phase4-restaurants.php
wp eval-file ek-tests/phase5-venues.php
if wp plugin is-active woocommerce 2>/dev/null; then wp eval-file ek-tests/phase4-woo-bridge.php; fi
echo "▶ Browser journeys (screenshots in tests/e2e/screenshots/)"
node tests/e2e/phase2.js
node tests/e2e/phase3.js
node tests/e2e/phase4.js
node tests/e2e/phase5.js
