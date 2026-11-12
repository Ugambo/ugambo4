# Passenger app

Expo SDK 58 / React Native app for passengers. Phase 3 covers booking:

- sign-in with an SMS code
- a full-screen map with a draggable bottom sheet
- pickup from GPS or search, destination search, Home and Work shortcuts
- vehicle choice with ETA, seats and price
- ride now or schedule for later, paying cash
- finding a driver, then the driver card (photo, name, vehicle, plate)
- trip status, and a receipt with the full fare breakdown
- ride history

Live updates use polling in Phase 3. Phase 4 replaces it with Socket.IO.
Calling and messaging the driver wait for a masked-calling vendor (see
`documentation/DECISIONS.md`).

```bash
cp .env.example .env     # EXPO_PUBLIC_API_URL as seen from the phone; GOOGLE_MAPS_ANDROID_API_KEY for Android maps
npx expo run:android     # or run:ios on a Mac: builds and installs a development build
pnpm start               # Metro for the installed development build
```

Checks that run without a phone:

```bash
pnpm typecheck
pnpm test             # ride phases, stale positions, cancellation fee, schedule slots
pnpm bundle:check     # Metro bundles the whole app for Android
```

Not yet run on a phone or emulator: none is available in the build environment.
All text is in `src/lib/messages.ts` (English and Hausa) and
`@rideswithme/mobile-core` (shared sign-in text).
