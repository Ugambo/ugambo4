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

Phase 8 adds:

- the SOS button and messages with the passenger during a trip
- rating the passenger and reporting a problem after a trip
- the driver's own rating on the earnings screen
- push notifications, and an explanation before asking for background location

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

## Store builds

Made with EAS Build from this folder:

```bash
eas build --profile preview --platform android      # an APK for testers (staging API)
eas build --profile production --platform all       # store builds
```

The profiles are in `eas.json`. The API address, EAS project and Firebase file
come from the EAS environment of the same name. A store build without them
stops at once. Steps and accounts: `documentation/LAUNCH.md` ("Store builds").
