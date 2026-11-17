# Phase 15 – page, dashboard, email, link and language checks

Run on 2026-11-17 with `node tests/e2e/phase15-sweep.js` against the local site with the SAMPLE data.

## A. Pages at 360 / 768 / 1280
- ✔ 48 English pages and listings open without errors (144 page views)
- ✔ No sideways scrolling
- ✔ 28 Hausa pages open without errors or sideways scrolling

## B. Dashboards at 360 / 768 / 1280
- ✔ Business dashboard (hotel): all 14 sections
- ✔ Business dashboard (restaurant): all 14 sections
- ✔ Business dashboard (venue): all 14 sections
- ✔ Business dashboard (directory): all 11 sections
- ✔ My Account: bookings, reservations, favourites, profile
- ✔ Ticket check-in page (staff)
- ✔ wp-admin: all 14 Explore Katsina pages + editors open without errors
- ✔ wp-admin: no sideways scrolling (wide tables scroll inside their own box)

## C. Emails (one of each, from the SAMPLE data)
- ✔ 67 email types generated
- ✔ 99 emails: branded, tagged, no placeholders or PHP leftovers
- ✔ All 30 different links in the emails open

## D. Links
- ✔ 178 different addresses crawled from the homepage and the sitemap: none broken

## E. Language switcher
- ✔ Language switcher: every page goes to its Hausa version and back
- ✔ No JavaScript errors anywhere

### Every email checked

| Type | Subject | Result |
|---|---|---|
| account_link | Add your earlier bookings to your account | ok |
| admin_booking_cancelled | [Explore Katsina] Booking EK-7VP9RG is now cancelled | ok |
| admin_booking_cancelled | [Explore Katsina] Booking EK-JXM8K5 is now cancelled | ok |
| admin_booking_cancelled | [Explore Katsina] Booking EK-LAYN3R is now cancelled | ok |
| admin_booking_declined | [Explore Katsina] Booking EK-7VP9RG is now declined | ok |
| admin_booking_declined | [Explore Katsina] Booking EK-JXM8K5 is now declined | ok |
| admin_booking_declined | [Explore Katsina] Booking EK-LAYN3R is now declined | ok |
| admin_business_submitted | New business waiting for approval: SAMPLE Brass Lantern Guest House | ok |
| admin_complaint | Complaint: EK-LAYN3R at SAMPLE Brass Lantern Guest House | ok |
| admin_guest_cancelled | [Explore Katsina] Guest cancelled EK-7VP9RG | ok |
| admin_guest_cancelled | [Explore Katsina] Guest cancelled EK-JXM8K5 | ok |
| admin_guest_cancelled | [Explore Katsina] Guest cancelled EK-LAYN3R | ok |
| admin_invoice_paused | Listing paused for unpaid invoice: SAMPLE Journey Hotel mwk99wzf (INV-202610-02832) | ok |
| admin_payment_conflict | ACTION NEEDED: payment for EK-LAYN3R arrived after the room was taken | ok |
| admin_payout_requested | Payout request: SAMPLE Brass Lantern Guest House | ok |
| admin_refund_needed | ACTION NEEDED: refund ₦5,000 for EK-LAYN3R | ok |
| admin_refund_review | Refund review needed: EK-LAYN3R (SAMPLE reason) | ok |
| admin_review_received | [Explore Katsina] New 4★ review: SAMPLE Brass Lantern Guest House | ok |
| admin_sale | New sale: Event promotion (₦15,000) | ok |
| admin_sale | New sale: Event tickets (₦5,000) | ok |
| admin_sale | New sale: Featured / Premium plan (₦10,000) | ok |
| admin_sale | New sale: Listing setup service (₦30,000) | ok |
| admin_sale | New sale: Tour booking (₦90,000) | ok |
| admin_sale | New sale: Verified badge application (₦5,000) | ok |
| admin_sale_conflict | Payment arrived after seats ran out: EKS-KRTRRP | ok |
| admin_sale_conflict | Payment arrived after seats ran out: EKS-N7F8QR | ok |
| admin_sale_refund | Refund to pay by hand: EKS-KRTRRP | ok |
| admin_sale_refund | Refund to pay by hand: EKS-N7F8QR | ok |
| booking_cancelled | Your booking has been cancelled (EK-JXM8K5) | ok |
| booking_cancelled | Your booking has been cancelled (EK-LAYN3R) | ok |
| booking_cancelled | Your reservation has been cancelled (EK-7VP9RG) | ok |
| booking_checked_out | checked_out (EK-LAYN3R) | ok |
| booking_completed | completed (EK-7VP9RG) | ok |
| booking_completed | completed (EK-JXM8K5) | ok |
| booking_confirmed | The venue accepted your request: pay the deposit to secure your date (EK-JXM8K5) | ok |
| booking_confirmed | Your booking is confirmed (EK-LAYN3R) | ok |
| booking_confirmed | Your reservation is confirmed (EK-7VP9RG) | ok |
| booking_created | Booking received: EK-7VP9RG | ok |
| booking_created | Booking received: EK-JXM8K5 | ok |
| booking_created | Booking received: EK-LAYN3R | ok |
| booking_created | New booking EK-JXM8K5: please confirm | ok |
| booking_created | New booking EK-LAYN3R: please confirm | ok |
| booking_created | New reservation EK-7VP9RG: please confirm | ok |
| booking_created | [Explore Katsina] New booking EK-7VP9RG at SAMPLE Garden Terrace Restaurant | ok |
| booking_created | [Explore Katsina] New booking EK-JXM8K5 at SAMPLE Royal Garden Events | ok |
| booking_created | [Explore Katsina] New booking EK-LAYN3R at SAMPLE Brass Lantern Guest House | ok |
| booking_declined | The hotel could not accept your booking (EK-LAYN3R) | ok |
| booking_declined | The restaurant could not accept your reservation (EK-7VP9RG) | ok |
| booking_declined | The venue could not accept your booking (EK-JXM8K5) | ok |
| booking_deposit_paid | deposit_paid (EK-JXM8K5) | ok |
| booking_expired | expired (EK-7VP9RG) | ok |
| booking_expired | expired (EK-JXM8K5) | ok |
| booking_expired | expired (EK-LAYN3R) | ok |
| booking_no_show | no_show (EK-7VP9RG) | ok |
| booking_no_show | no_show (EK-LAYN3R) | ok |
| booking_requested | requested (EK-JXM8K5) | ok |
| business_approved | Your business is now live on Explore Katsina | ok |
| business_guest_cancelled | Guest cancelled booking EK-JXM8K5 | ok |
| business_guest_cancelled | Guest cancelled booking EK-LAYN3R | ok |
| business_guest_cancelled | Guest cancelled reservation EK-7VP9RG | ok |
| business_paused | Your Explore Katsina listing is paused | ok |
| business_rejected | About your Explore Katsina listing | ok |
| business_resumed | Your Explore Katsina listing is live again | ok |
| business_submitted | We received your listing | ok |
| complaint_business | A guest reported a problem with booking EK-LAYN3R | ok |
| complaint_received | We received your report about EK-LAYN3R | ok |
| complaint_resolved | Update on your report about EK-LAYN3R | ok |
| complaint_resolved | Update on your report about EK-LAYN3R | ok |
| complaint_resolved_business | Complaint about booking EK-LAYN3R resolved | ok |
| complaint_resolved_business | Complaint about booking EK-LAYN3R resolved | ok |
| funds_released | ₦23,400 is now available for payout | ok |
| guest_cancelled | Your booking EK-JXM8K5 is cancelled | ok |
| guest_cancelled | Your booking EK-LAYN3R is cancelled | ok |
| guest_cancelled | Your reservation EK-7VP9RG is cancelled | ok |
| invoice_issued | Your commission invoice INV-202610-02832 | ok |
| invoice_paid | Receipt: invoice INV-202610-02832 paid | ok |
| invoice_paused | Your listing has been paused (unpaid invoice) | ok |
| invoice_reminder | Reminder: invoice INV-202610-02832 is due in 7 days | ok |
| payment_conflict | About your payment for EK-LAYN3R | ok |
| payout_approved | Payout of ₦15,000 approved | ok |
| payout_paid | Payout of ₦15,000 sent | ok |
| payout_rejected | About your payout request of ₦15,000 | ok |
| plan_1 | Your Featured plan ends tomorrow | ok |
| plan_7 | Your Featured plan ends in 7 days | ok |
| plan_ended | Your Featured plan has ended | ok |
| refund_paid | Your refund for EK-LAYN3R has been sent | ok |
| review_invite | Review SAMPLE Brass Lantern Guest House on Explore Katsina | ok |
| review_invite | Review SAMPLE Garden Terrace Restaurant on Explore Katsina | ok |
| review_invite | Review SAMPLE Royal Garden Events on Explore Katsina | ok |
| review_received | New 4★ review for SAMPLE Brass Lantern Guest House | ok |
| sale_cancelled | Cancelled: EKS-KRTRRP | ok |
| sale_cancelled | Cancelled: EKS-N7F8QR | ok |
| sale_plan | Receipt: EKS-MN2YBJ | ok |
| sale_promotion | Receipt: EKS-FKBVUU | ok |
| sale_setup | Receipt: EKS-PM8Z8X | ok |
| sale_ticket | Receipt: EKS-N7F8QR | ok |
| sale_tour | Receipt: EKS-KRTRRP | ok |
| sale_verified | Receipt: EKS-7P6JVM | ok |
| welcome | Welcome to Explore Katsina | ok |
