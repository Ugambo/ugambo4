# Lighthouse (mobile) – local site

Run on 2026-11-17 with `node tests/lighthouse.js` (Lighthouse 12, mobile, simulated slow 4G). Target: Performance 90+.

| Page | Performance | Accessibility | Best practices | SEO | First paint | Largest paint | Blocking | Layout shift |
|---|---|---|---|---|---|---|---|---|
| / | 96 | 100 | 100 | 100 | 1.8 s | 2.6 s | 0 ms | 0.028 |
| /explore/ | 98 | 100 | 100 | 100 | 1.8 s | 2.0 s | 0 ms | 0 |
| /hotels/ | 95 | 100 | 100 | 100 | 1.8 s | 2.7 s | 0 ms | 0.018 |
| /restaurants/ | 96 | 100 | 100 | 100 | 1.8 s | 2.6 s | 0 ms | 0.018 |
| /event-centres/ | 92 | 100 | 100 | 100 | 1.8 s | 3.2 s | 0 ms | 0 |
| /things-to-do/ | 95 | 100 | 100 | 100 | 1.8 s | 2.7 s | 0 ms | 0 |
| /map/ | 96 | 100 | 96 | 100 | 2.0 s | 2.4 s | 10 ms | 0.001 |
| /top-hotels/ | 98 | 100 | 100 | 100 | 1.8 s | 2.1 s | 0 ms | 0 |
| /events/ | 98 | 100 | 100 | 100 | 1.8 s | 2.2 s | 0 ms | 0.007 |
| /tours/ | 99 | 100 | 100 | 100 | 1.7 s | 2.0 s | 0 ms | 0 |
| /directory/ | 98 | 100 | 100 | 100 | 1.8 s | 2.1 s | 0 ms | 0.002 |
| /stories/ | 99 | 100 | 100 | 100 | 1.7 s | 2.0 s | 0 ms | 0 |
| /contact/ | 95 | 100 | 100 | 100 | 2.3 s | 2.6 s | 0 ms | 0 |
| /shop/ | 95 | 100 | 100 | 100 | 2.1 s | 2.6 s | 0 ms | 0.002 |
| /guides/ | 94 | 100 | 100 | 100 | 2.1 s | 2.7 s | 0 ms | 0.002 |
| /hotels/sample-crimson-gate-hotel/ | 97 | 100 | 100 | 100 | 1.8 s | 2.4 s | 0 ms | 0 |
| /restaurants/sample-mama-tuwo-kitchen/ | 93 | 100 | 100 | 100 | 1.8 s | 3.0 s | 0 ms | 0 |
| /event-centres/sample-grand-durbar-hall/ | 96 | 100 | 100 | 100 | 1.8 s | 2.6 s | 0 ms | 0 |
| /attractions/national-museum-katsina/ | 97 | 100 | 100 | 100 | 1.8 s | 2.4 s | 0 ms | 0 |
| /ha/ | 96 | 100 | 100 | 66 | 1.8 s | 2.6 s | 0 ms | 0.028 |

Known local-only effects: map tiles cannot load without internet (Map page "Best practices"); the Hausa homepage is "noindex" until translated (its SEO score). Real hosting adds network time; a host with LiteSpeed or a CDN usually scores higher.
