# Hausa review

All text in RideswithMe is in English and Hausa. The Hausa was written during
development and **must be reviewed by a native Hausa speaker before launch**
(DECISIONS D-017). This page explains what is checked automatically, how to
export the text for the reviewer, what to review first, and how corrections
come back into the code.

## What the automatic checks catch

Every catalogue has a test (`checkCatalog` in `packages/utilities/src/catalog-check.ts`)
that runs with `pnpm test` and in CI. It fails when a Hausa text:

| Problem                        | Example                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------- |
| is missing                     | a new English key with no Hausa                                                  |
| is blank                       | `'ride.cancel': ''`                                                              |
| has different `{placeholders}` | English `Seat {label}`, Hausa `Kujera {seat}`: the seat label would never appear |
| is word-for-word the English   | `'help.title': 'Help'`: probably never translated                                |
| exists only in Hausa           | a leftover after an English key was removed                                      |

Text that may stay the same is allowed: placeholders, numbers and symbols only
(for example `{brand} •••• {last4}`), and names and codes such as RideswithMe,
SOS, NIN, VIP and Keke Napep. The product names (`app.name`) are allowed
explicitly.

The TypeScript types also refuse to build an app whose Hausa catalogue lacks a
key. **No automatic check can tell whether the Hausa is correct, natural or
polite.** Only the reviewer can.

| Catalogue                              | File                                                     |     Texts |
| -------------------------------------- | -------------------------------------------------------- | --------: |
| SMS and error messages (all apps)      | `packages/utilities/src/i18n.ts`                         |        59 |
| Passenger rides (app and website)      | `packages/utilities/src/passenger-messages.ts`           |       306 |
| Mobile apps: common                    | `packages/mobile-core/src/messages.ts`                   |        19 |
| Staff sign-in (admin, partner portal)  | `packages/web-core/src/client/staff-sign-in-messages.ts` |        15 |
| Push notifications                     | `apps/api/src/notifications/templates.ts`                |        20 |
| Passenger app                          | `apps/passenger-mobile/src/lib/messages.ts`              |        12 |
| Passenger website                      | `apps/passenger-web/src/lib/messages.ts`                 |        44 |
| Driver app                             | `apps/driver-mobile/src/lib/messages.ts`                 |       227 |
| Partner portal (fleets, bus operators) | `apps/fleet-portal/src/lib/messages.ts`                  |       195 |
| Admin dashboard                        | `apps/admin-dashboard/src/lib/messages.ts`               |       522 |
| **Total**                              |                                                          | **1,419** |

## Exporting the text for review

```sh
pnpm install && pnpm build
pnpm hausa:export                 # writes hausa-review.csv (not committed)
pnpm hausa:export ~/review.csv    # or anywhere else
```

The CSV opens in Excel, Google Sheets or LibreOffice with the Hausa letters
(ɗ, ƙ, ƴ, ɓ) intact. It has one row per text, with these columns:

- catalogue
- key
- English
- current Hausa
- **hausa_corrected** (blank, for the reviewer)
- **comment** (blank, for the reviewer)

Shared text appears once, under its own catalogue, not again in each app that
uses it.

`{name}`-style placeholders are filled in by the app. They must stay exactly
as they are, but the reviewer may move them within the sentence.

## Order of review

The reviewer should not need to review everything at once. Go in this order
and sign off each part below:

1. **Safety**:
   - SOS (`sos.*`), trip sharing (`share.*`, `track.*`)
   - the `sos_*` push notifications
   - incident reports (`incident.*`, `report.*`)
   - In an emergency these must be unmistakable.
2. **Money**:
   - payment, wallet, cash and receipts (`pay.*`, `wallet.*`, `receipt.*`, `fare.*`)
   - promotion codes (`promo.*`)
   - payouts in the driver app
   - Amounts and who pays whom must be clear.
3. **Sign-in, SMS and errors**:
   - The `sms.*` texts are sent as text messages. Because ƙ, ɗ and ɓ need
     Unicode SMS (70 characters per part), shorter is cheaper (DECISIONS B-7).
   - Also the `error.*` texts.
4. **Booking and the live trip**:
   - `choose.*`, `ride.*`, `bus.*`
   - the driver app's trip screens
5. **Account and privacy**: deletion (`account.*`) and policy wording. NDPA
   notices must be accurate.
6. **Staff screens**: the admin dashboard and partner portal. Lower priority:
   staff can switch to English.

## Terms to settle first

Consistent words matter more than perfect ones. The reviewer should confirm or
replace each term below. The chosen word is then used everywhere.

| English           | Current Hausa | Notes for the reviewer                       |
| ----------------- | ------------- | -------------------------------------------- |
| ride / trip       | tafiya        | Used for both.                               |
| driver            | direba        |                                              |
| passenger         | fasinja       |                                              |
| fare              | kuɗin tafiya  |                                              |
| cash              | kuɗi hannu    | Paying the driver in cash.                   |
| wallet            | walat         | A loanword. Is there a better everyday term? |
| top up            | ƙara kuɗi     |                                              |
| booking fee       | kuɗin oda     |                                              |
| promotion code    | lambar talla  |                                              |
| seat              | kujera        |                                              |
| ticket            | tikiti        |                                              |
| cancel            | soke          |                                              |
| rate (stars)      | ba … maki     |                                              |
| help              | taimako       |                                              |
| delete my account | share asusuna | Confirm this reads as permanent deletion.    |

Tone: the user is addressed in the polite plural (_ku_, _-ku_, _-nku_, as in
"Da fatan ku…"), which also avoids assuming the reader's gender (DECISIONS
D-017). The reviewer should say whether this suits a ride app or whether a more
direct tone is better.

## Applying corrections

1. A developer copies each `hausa_corrected` value into the `ha` object of the
   catalogue named in the row, under the same key.
2. `pnpm test` confirms nothing was lost (placeholders, blanks).
3. Commit with a message naming the reviewer's sign-off, for example "Hausa
   review: safety and money texts".
4. Record the sign-off in the table below.

New text written after the review goes through the same export, filtered to
new keys (compare with the last reviewed CSV).

## Sign-off

| Part                     | Reviewer | Date | Notes |
| ------------------------ | -------- | ---- | ----- |
| 1. Safety                |          |      |       |
| 2. Money                 |          |      |       |
| 3. Sign-in, SMS, errors  |          |      |       |
| 4. Booking and live trip |          |      |       |
| 5. Account and privacy   |          |      |       |
| 6. Staff screens         |          |      |       |
