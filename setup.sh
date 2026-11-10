#!/usr/bin/env bash
# =============================================================================
# Explore Katsina: re-runnable local setup.
#
#   ./setup.sh            Set up / update the local site (safe to run again and again)
#   ./setup.sh --offline  Force the "offline" Docker Compose mode
#   ./setup.sh --reset    Delete the local site's database and start fresh
#
# Two ways of running WordPress locally:
#   1. wp-env (default, as requested): used when wordpress.org can be reached.
#   2. "offline" Docker Compose: used automatically when wordpress.org or the
#      Linux package mirrors are blocked (as in the Claude cloud session).
#      Uses only ready-made official images from Docker Hub.
#
# Local site:  http://localhost:8888        (admin: http://localhost:8888/wp-admin)
# Test inbox:  http://localhost:8025        (offline mode: every email lands here)
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")"

WP_IMAGE="wordpress:php8.2-apache"
COMPOSE="docker compose -f docker-compose.offline.yml"
MODE=""
RESET=0
for arg in "$@"; do
  case "$arg" in
    --offline) MODE="offline" ;;
    --reset)   RESET=1 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
  esac
done

say()  { printf '\n\033[1;35m▶ %s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m✔\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }
die()  { printf '  \033[31m✘ %s\033[0m\n' "$1"; exit 1; }

# Retry helper for flaky downloads (e.g. Docker Hub rate limits).
retry() { local n=0; until "$@"; do n=$((n+1)); [ $n -ge 5 ] && return 1; warn "Retrying in $((n*15))s…"; sleep $((n*15)); done; }

# -----------------------------------------------------------------------------
say "1/7 Checking prerequisites"
command -v docker >/dev/null || die "Docker not found. Install Docker Desktop (https://www.docker.com/products/docker-desktop/), or use LocalWP (https://localwp.com) instead."
docker info >/dev/null 2>&1 || die "Docker is installed but not running. Start Docker Desktop and run this again."
ok "Docker is running"
command -v node >/dev/null || die "Node.js not found. Install it from https://nodejs.org (version 18 or newer)."
ok "Node.js $(node -v)"

if [ -z "$MODE" ]; then
  if curl -s -o /dev/null --max-time 8 https://api.wordpress.org/core/version-check/1.7/; then MODE="wp-env"; else MODE="offline"; fi
fi
ok "Mode: $MODE"

# -----------------------------------------------------------------------------
say "2/7 Local secrets (.env, never committed to git)"
if [ ! -f .env ]; then
  KEY=$(openssl rand -base64 32 2>/dev/null || node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64'))")
  PASS=$(node -e "process.stdout.write(require('crypto').randomBytes(12).toString('base64').replace(/[^A-Za-z0-9]/g,'x'))")
  cat > .env <<EOF
# Local development secrets. Not committed. Keep a copy of EK_ENCRYPTION_KEY safe:
# without it, bank details saved on this site cannot be read.
EK_ENCRYPTION_KEY=$KEY
EK_ADMIN_USER=admin
EK_ADMIN_PASSWORD=$PASS
EK_ADMIN_EMAIL=admin@explorekatsina.local
EOF
  ok "Created .env with a new encryption key and admin password"
else
  ok ".env already exists (kept)"
fi
set -a; . ./.env; set +a

# -----------------------------------------------------------------------------
say "3/7 WordPress core (from the official Docker image $WP_IMAGE)"
docker image inspect "$WP_IMAGE" >/dev/null 2>&1 || retry docker pull -q "$WP_IMAGE" >/dev/null
if [ ! -f .wp-core/wp-includes/version.php ]; then
  rm -rf .wp-core
  cid=$(docker create "$WP_IMAGE")
  docker cp "$cid:/usr/src/wordpress" .wp-core >/dev/null
  docker rm "$cid" >/dev/null
fi
WP_VERSION=$(sed -n "s/^\$wp_version = '\(.*\)';/\1/p" .wp-core/wp-includes/version.php)
ok "WordPress $WP_VERSION"

# -----------------------------------------------------------------------------
say "4/7 Starting the local site"
if [ "$MODE" = "wp-env" ]; then
  [ -d node_modules/@wordpress/env ] || npm install --no-audit --no-fund
  [ "$RESET" = 1 ] && npx wp-env destroy --force || true
  npx wp-env start
  wp() { npx wp-env run cli wp "$@"; }
else
  for img in mariadb:lts wordpress:cli-php8.2 axllent/mailpit:v1.21; do
    docker image inspect "$img" >/dev/null 2>&1 || retry docker pull -q "$img" >/dev/null
  done
  [ "$RESET" = 1 ] && $COMPOSE down -v || true
  $COMPOSE up -d
  wp() { $COMPOSE run --rm -T cli wp "$@"; }
  for i in $(seq 1 60); do curl -s -o /dev/null http://localhost:8888/ && break; sleep 2; done
fi
ok "Site is up at http://localhost:8888"

# -----------------------------------------------------------------------------
say "5/7 WordPress settings"
if ! wp core is-installed 2>/dev/null; then
  wp core install --url=http://localhost:8888 --title="Explore Katsina" \
    --admin_user="$EK_ADMIN_USER" --admin_password="$EK_ADMIN_PASSWORD" --admin_email="$EK_ADMIN_EMAIL" --skip-email
  ok "WordPress installed"
fi
if [ "$MODE" = "wp-env" ]; then
  # wp-env writes its own wp-config.php, so add our constants there.
  wp config set EK_ENCRYPTION_KEY "$EK_ENCRYPTION_KEY" --type=constant --quiet
  wp config set WP_ENVIRONMENT_TYPE local --type=constant --quiet
fi
wp option update blogname "Explore Katsina" --quiet
wp option update blogdescription "Hotels, restaurants, event centres and things to do in Katsina State" --quiet
wp option update timezone_string "Africa/Lagos" --quiet
wp option update date_format "j F Y" --quiet
wp option update time_format "g:i a" --quiet
wp option update start_of_week 1 --quiet
wp option update users_can_register 0 --quiet
wp option update default_comment_status closed --quiet
wp rewrite structure '/%postname%/' --quiet
ok "Site title, Lagos time zone, clean URLs"

# -----------------------------------------------------------------------------
say "6/7 Plugins"
wp plugin activate explore-katsina-core --quiet
wp ek install
wp plugin delete hello --quiet 2>/dev/null || true
# Free plugins, added phase by phase. They come from wordpress.org, so they are
# skipped (with a warning) when wordpress.org can't be reached.
#   Phase 3: WooCommerce + Paystack + Flutterwave (payments only)
EXTRA_PLUGINS=(woocommerce woo-paystack rave-woocommerce-payment-gateway)
if curl -s -o /dev/null --max-time 8 https://downloads.wordpress.org/; then
  # Download on this computer, then install from the file. (WordPress inside Docker may not
  # be able to reach wordpress.org itself, e.g. behind a proxy.)
  mkdir -p .cache/plugins
  for slug in "${EXTRA_PLUGINS[@]}"; do
    if ! wp plugin is-installed "$slug" 2>/dev/null; then
      curl -fsSL -o ".cache/plugins/$slug.zip" "https://downloads.wordpress.org/plugin/$slug.latest-stable.zip" \
        && wp plugin install "ek-plugin-cache/$slug.zip" --quiet \
        || warn "Could not install $slug"
    fi
    wp plugin activate "$slug" --quiet 2>/dev/null || true
  done
  if wp plugin is-active woocommerce 2>/dev/null; then
    # Naira, Nigeria/Katsina, guest checkout, no setup wizard. Paystack/Flutterwave keys are
    # added later by the owner (TEST keys first) under WooCommerce → Settings → Payments.
    wp option update woocommerce_currency NGN --quiet
    wp option update woocommerce_currency_pos left --quiet
    wp option update woocommerce_price_num_decimals 0 --quiet
    wp option update woocommerce_default_country "NG:KT" --quiet
    wp option update woocommerce_enable_guest_checkout yes --quiet
    wp option update woocommerce_calc_taxes no --quiet
    wp option update woocommerce_coming_soon no --quiet 2>/dev/null || true
    wp option update woocommerce_onboarding_profile '{"skipped":true}' --format=json --quiet 2>/dev/null || true
    ok "WooCommerce set to Naira (₦), Katsina, guest checkout"
  fi
else
  warn "Skipping ${EXTRA_PLUGINS[*]}: wordpress.org can't be reached from here."
  warn "Bookings use the local TEST payment screen until WooCommerce is installed."
fi
ok "explore-katsina-core active"
# Researched guide content (attractions, Sallah Durbar, Plan your trip, draft stories). Re-run safe:
# only adds what is missing and never overwrites edits made in wp-admin.
wp ek import-guide && ok "Guide content imported"
# WordPress's own demo post and page would otherwise appear among the Stories and in menus.
for demo in "post:hello-world" "page:sample-page"; do
  id=$(wp post list --post_type="${demo%%:*}" --name="${demo#*:}" --field=ID 2>/dev/null | tail -n1)
  [ -n "$id" ] && wp post delete "$id" --force --quiet 2>/dev/null || true
done

# -----------------------------------------------------------------------------
say "7/7 Done"
wp ek status
cat <<EOF

  Site:        http://localhost:8888
  Admin:       http://localhost:8888/wp-admin   (user: $EK_ADMIN_USER, password in .env)
  Sign-up:     http://localhost:8888/list-your-business/
  Dashboard:   http://localhost:8888/business-dashboard/
EOF
[ "$MODE" = "offline" ] && echo "  Test inbox:  http://localhost:8025"
echo
