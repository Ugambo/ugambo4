#!/usr/bin/env bash
# Runs all automated checks against the local site (start it with ./setup.sh first).
set -uo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
if docker compose -f docker-compose.offline.yml ps --status running 2>/dev/null | grep -q wordpress; then
  wp() { docker compose -f docker-compose.offline.yml run --rm -T cli wp "$@"; }
else
  wp() { npx wp-env run cli wp "$@"; }
fi
FAILED=()
run() { "$@" || FAILED+=("$*"); }   # Keep going; list every failing step at the end.
echo "▶ Server-side security & logic checks"
run wp eval-file ek-tests/phase2-security.php
run wp eval-file ek-tests/phase3-hotels.php
run wp eval-file ek-tests/phase4-restaurants.php
run wp eval-file ek-tests/phase5-venues.php
run wp eval-file ek-tests/phase6-accounts.php
run wp eval-file ek-tests/phase7-money.php
run wp eval-file ek-tests/phase8-rank-map.php
run wp eval-file ek-tests/phase9-revenue.php
run wp eval-file ek-tests/phase10-guide.php
run wp eval-file ek-tests/phase11-theme.php
run wp eval-file ek-tests/phase12-plugins.php
if wp plugin is-active woocommerce 2>/dev/null; then run wp eval-file ek-tests/phase4-woo-bridge.php; fi
echo "▶ Browser journeys (screenshots in tests/e2e/screenshots/)"
run node tests/e2e/phase2.js
run node tests/e2e/phase3.js
run node tests/e2e/phase4.js
run node tests/e2e/phase5.js
run node tests/e2e/phase6.js
run node tests/e2e/phase7.js
run node tests/e2e/phase8.js
run node tests/e2e/phase9.js
run node tests/e2e/phase10.js
run node tests/e2e/phase11.js
run node tests/e2e/phase12.js
if [ ${#FAILED[@]} -gt 0 ]; then
  printf "\n✘ Failed: %s\n" "${FAILED[@]}"
  exit 1
fi
echo
echo "✔ Everything passed"
