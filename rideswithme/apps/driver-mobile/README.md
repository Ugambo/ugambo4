# Driver app

Expo SDK 58 / React Native app for drivers. Phase 2 covers the driver application:

- sign-in with an SMS code
- a checklist of what is missing
- name and NIN, vehicle, payout account
- photographing or choosing each required document, uploaded straight to private
  storage
- sending the application for review, and seeing the result

Phase 3 adds driving: going online (foreground location), ride requests with a
15-second countdown, accept or decline, navigation to pickup and destination
(Google Maps), arrived / start / complete, collecting cash, no-show and
cancellation, and an earnings screen (today, this week, each trip with the fee
taken). Phase 4 adds background location, an offline position buffer and live
updates instead of polling.

Development builds are required (not Expo Go), because background location
arrives in Phase 4:

```bash
cp .env.example .env              # EXPO_PUBLIC_API_URL as reachable from the phone
npx expo run:android              # or run:ios on a Mac; builds and installs a development build
pnpm start                        # Metro for the installed development build
```

Checks that run without a phone:

```bash
pnpm typecheck
pnpm test            # checklist, dates, upload/retry, offer countdown, cash, earnings totals
pnpm bundle:check    # Metro bundles the whole app for Android
```

Not yet run on a phone or emulator: none is available in the build environment.
Try it on a low-end Android phone on mobile data before calling Phase 2 done.
All text is in `src/lib/messages.ts` (English and Hausa).
