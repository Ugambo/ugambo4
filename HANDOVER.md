# HANDOVER — Explore Katsina

This file is updated at the end of every phase so that anyone (or a new Claude
session) can pick up exactly where the last one stopped.

## Current status
- **Phase 1 (Architecture plan): done, waiting for owner approval.**
- Nothing has been built yet. No WordPress install, no plugin code.
- Next step: Phase 2 (business accounts & approval), **only after the owner approves the plan.**

## Where things are
| File | What it is |
|---|---|
| `docs/ARCHITECTURE.md` | The full Phase 1 plan: plugins, database structure, money flow, rankings formula |
| `setup.sh` | Re-runnable setup script. Phase 1 version only checks prerequisites (Docker, Node, npm) |
| `HANDOVER.md` | This file |

## Decisions made so far
- Custom plugin `explore-katsina-core` for all business logic.
- WooCommerce + Paystack + Flutterwave used **only** for taking payments (and the Shop / Digital Guides).
- Map: Leaflet + OpenStreetMap, built so Google Maps can be switched on later.

## Decisions waiting for the owner (asked at end of Phase 1)
1. Approve: handle **all** business types in the custom plugin (no Directorist / GeoDirectory). *Recommended.*
2. Approve: build banner ads into the custom plugin instead of Advanced Ads (its click/view tracking is a paid add-on). *Recommended.*
3. Approve adding **FluentSMTP** (free) so emails don't land in spam. *Recommended.*
4. Approve showing the 2 brand palette/font options at the **start of Phase 2** so dashboards are built in the final look.
5. Minimum verified reviews before a business shows a rank number (suggested: 3).
6. Later (Phase 11): whether to buy Polylang for WooCommerce (paid) or keep Shop/checkout English-only at launch.

## Environment notes (for the next session)
- Cloud session: Docker CLI is installed but the daemon isn't started automatically. Start it with
  `dockerd > /tmp/dockerd.log 2>&1 &`. Docker Hub pulls work.
- **Blocked by the cloud environment's network policy:** `wordpress.org`, `downloads.wordpress.org`,
  `api.wordpress.org` (WordPress core and plugin downloads) and `github.com`. The owner must add these under
  the environment's Network access → Allowed domains, otherwise plugins cannot be installed in the cloud session.
  On the owner's own computer this doesn't apply.
- Reachable: Docker Hub, npm (`@wordpress/env`), Packagist, raw.githubusercontent.com.

## Placeholders to replace before launch (running list)
- Contact email `info@explorekatsina.com.ng` (PLACEHOLDER)
- Phone `+234 800 000 0000` (PLACEHOLDER)
- Social handles `@explorekatsina` (PLACEHOLDER)
- Commission rates (placeholders: hotels 10%, event centres 10%, tour operators 15%, restaurant reservations 0%, food orders 10%)
- Plan prices (to be set in Phase 9)
- Paystack and Flutterwave live keys (test keys only until launch)
