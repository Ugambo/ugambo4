import { DEFAULT_LANGUAGE, type Language } from '@rideswithme/shared-types';

type Catalog = Record<string, string>;

/**
 * English source strings. Every key must also exist in Hausa (enforced by the
 * type of `ha` below and by a test). Hausa strings need review by a native
 * speaker before launch; see documentation/DECISIONS.md.
 */
const en = {
  'sms.otp':
    'Your RideswithMe code is {code}. It expires in {minutes} minutes. Do not share it with anyone.',
  'error.VALIDATION_FAILED': 'Some of the details you entered are not valid.',
  'error.UNAUTHENTICATED': 'Please sign in again.',
  'error.FORBIDDEN': 'You do not have permission to do this.',
  'error.MFA_REQUIRED': 'Enter the code from your authenticator app to continue.',
  'error.NOT_FOUND': 'We could not find what you were looking for.',
  'error.CONFLICT': 'This has already been done.',
  'error.RATE_LIMITED': 'Too many attempts. Please wait and try again.',
  'error.OTP_INVALID': 'That code is not correct.',
  'error.OTP_EXPIRED': 'That code has expired. Request a new one.',
  'error.OTP_TOO_MANY_ATTEMPTS': 'Too many wrong codes. Request a new one.',
  'error.OTP_RESEND_TOO_SOON': 'Please wait {seconds} seconds before requesting another code.',
  'error.REFRESH_TOKEN_INVALID': 'Your session has ended. Please sign in again.',
  'error.SESSION_REVOKED': 'Your session has ended. Please sign in again.',
  'error.ACCOUNT_SUSPENDED': 'Your account has been suspended. Contact support.',
  'error.TOTP_INVALID': 'That authenticator code is not correct.',
  'error.TOTP_NOT_ENROLLED': 'Set up two-factor authentication first.',
  'error.TOTP_ALREADY_ENABLED': 'Two-factor authentication is already on.',
  'error.LAST_SUPER_ADMIN': 'The last super admin cannot be removed.',
  'error.SMS_DELIVERY_FAILED': 'We could not send the code. Please try again.',
  'error.INTERNAL_ERROR': 'Something went wrong. Please try again.',
  'error.DRIVER_NOT_REGISTERED': 'Start your driver registration first.',
  'error.DRIVER_PROFILE_LOCKED': 'Your application is being reviewed and cannot be changed now.',
  'error.DRIVER_INCOMPLETE': 'Some details or documents are still missing.',
  'error.INVALID_STATE': 'This cannot be done right now.',
  'error.UPLOAD_INVALID':
    'The file could not be used. Upload it again as a photo (JPG or PNG) or PDF.',
  'error.NIN_ALREADY_REGISTERED': 'This NIN is already registered to another driver.',
  'error.PLATE_ALREADY_REGISTERED': 'This plate number is already registered.',
  'error.VEHICLE_CATEGORY_UNAVAILABLE': 'This vehicle type is not available yet.',
  'error.STORAGE_UNAVAILABLE': 'File upload is not available right now. Please try again shortly.',
  'error.OUTSIDE_SERVICE_AREA': 'RideswithMe is not available at this pickup point yet.',
  'error.QUOTE_EXPIRED': 'This price has expired. Check the price again.',
  'error.PAYMENT_METHOD_UNAVAILABLE':
    'This payment method is not available. Please choose another way to pay.',
  'error.RIDE_ALREADY_ACTIVE': 'You already have a ride in progress.',
  'error.OFFER_UNAVAILABLE': 'This ride request is no longer available.',
  'error.DRIVER_NOT_ELIGIBLE': 'You cannot go online yet. Check your documents.',
  'error.IDEMPOTENCY_KEY_REQUIRED': 'Something went wrong. Please try again.',
  'error.IDEMPOTENCY_CONFLICT': 'This request is already being processed.',
  'error.MAPS_UNAVAILABLE': 'Maps are not available right now. Please try again shortly.',
  'error.WALLET_INSUFFICIENT_FUNDS':
    'Your wallet balance is too low. Top up or choose another way to pay.',
  'error.WALLET_LIMIT_EXCEEDED': 'This would take your wallet over its limit.',
  'error.OUTSTANDING_BALANCE':
    'You have an unpaid balance. Please pay it before booking another ride.',
  'error.CARD_NOT_FOUND': 'We could not find that card. Choose another card or add it again.',
  'error.PAYMENT_PROVIDER_UNAVAILABLE':
    'Card payments are not available right now. Please try again shortly.',
  'error.PAYOUT_UNAVAILABLE': 'You cannot withdraw this amount right now.',
  'error.PAYOUT_ACCOUNT_RECENTLY_CHANGED':
    'Withdrawals are paused for 24 hours after changing your bank account.',
  'error.REFUND_NOT_ALLOWED': 'This refund cannot be made.',
  'error.DISPUTE_EXISTS': 'You have already reported a problem with this ride.',
  'error.WEBHOOK_SIGNATURE_INVALID': 'Invalid signature.',
  'error.ROUTE_NOT_FOUND': 'We could not find a route between these places.',
  'sms.driver_approved':
    'Your RideswithMe driver account is approved. Open the RideswithMe Driver app to go online.',
  'sms.driver_rejected':
    'Your RideswithMe driver application needs changes. Open the RideswithMe Driver app to see what to fix.',
} satisfies Catalog;

export type MessageKey = keyof typeof en;

const ha: Record<MessageKey, string> = {
  'sms.otp':
    'Lambar tabbatarwarku ta RideswithMe ita ce {code}. Za ta ƙare cikin minti {minutes}. Kada ku bayyana ta ga kowa.',
  'error.VALIDATION_FAILED': 'Akwai kuskure a bayanan da kuka shigar.',
  'error.UNAUTHENTICATED': 'Da fatan za ku sake shiga.',
  'error.FORBIDDEN': 'Ba ku da izinin yin wannan.',
  'error.MFA_REQUIRED': 'Shigar da lambar daga manhajar tantancewarku don ci gaba.',
  'error.NOT_FOUND': 'Ba a sami abin da kuke nema ba.',
  'error.CONFLICT': 'An riga an yi wannan.',
  'error.RATE_LIMITED': 'Ƙoƙari ya yi yawa. Da fatan a jira sannan a sake gwadawa.',
  'error.OTP_INVALID': 'Wannan lambar ba daidai ba ce.',
  'error.OTP_EXPIRED': 'Wannan lambar ta ƙare. Nemi sabuwa.',
  'error.OTP_TOO_MANY_ATTEMPTS': 'An shigar da lambobi marasa daidai da yawa. Nemi sabuwar lamba.',
  'error.OTP_RESEND_TOO_SOON': 'Da fatan a jira daƙiƙa {seconds} kafin a nemi wata lamba.',
  'error.REFRESH_TOKEN_INVALID': 'Zamanku ya ƙare. Da fatan za ku sake shiga.',
  'error.SESSION_REVOKED': 'Zamanku ya ƙare. Da fatan za ku sake shiga.',
  'error.ACCOUNT_SUSPENDED': 'An dakatar da asusunku. Tuntuɓi masu taimako.',
  'error.TOTP_INVALID': 'Lambar manhajar tantancewa ba daidai ba ce.',
  'error.TOTP_NOT_ENROLLED': 'Da farko ku saita tantancewa mataki biyu.',
  'error.TOTP_ALREADY_ENABLED': 'Tantancewa mataki biyu ta riga ta kunnu.',
  'error.LAST_SUPER_ADMIN': 'Ba za a iya cire babban mai gudanarwa na ƙarshe ba.',
  'error.SMS_DELIVERY_FAILED': 'Ba mu iya aika lambar ba. Da fatan a sake gwadawa.',
  'error.INTERNAL_ERROR': 'Wani abu ya faru ba daidai ba. Da fatan a sake gwadawa.',
  'error.DRIVER_NOT_REGISTERED': 'Da farko ku fara rajistar direba.',
  'error.DRIVER_PROFILE_LOCKED': 'Ana duba bukatarku, ba za a iya canza ta yanzu ba.',
  'error.DRIVER_INCOMPLETE': 'Akwai wasu bayanai ko takardu da suka rage.',
  'error.INVALID_STATE': 'Ba za a iya yin wannan yanzu ba.',
  'error.UPLOAD_INVALID':
    'Ba a iya amfani da fayil ɗin ba. Sake loda shi a matsayin hoto (JPG ko PNG) ko PDF.',
  'error.NIN_ALREADY_REGISTERED': 'An riga an yi rajistar wannan NIN ga wani direba.',
  'error.PLATE_ALREADY_REGISTERED': 'An riga an yi rajistar wannan lambar mota.',
  'error.VEHICLE_CATEGORY_UNAVAILABLE': "Wannan nau'in abin hawa bai samu ba tukuna.",
  'error.STORAGE_UNAVAILABLE':
    'Ba a iya loda fayil yanzu. Da fatan a sake gwadawa nan ba da jimawa ba.',
  'error.OUTSIDE_SERVICE_AREA': 'RideswithMe bai samu a wannan wurin ɗauka ba tukuna.',
  'error.QUOTE_EXPIRED': 'Wannan farashi ya ƙare. Sake duba farashin.',
  'error.PAYMENT_METHOD_UNAVAILABLE':
    'Wannan hanyar biya ba ta samuwa. Da fatan a zaɓi wata hanyar biya.',
  'error.RIDE_ALREADY_ACTIVE': 'Kuna da tafiya da ke gudana tuni.',
  'error.OFFER_UNAVAILABLE': 'Wannan bukatar tafiya ba ta samuwa yanzu.',
  'error.DRIVER_NOT_ELIGIBLE': 'Ba za ku iya fara aiki ba tukuna. Duba takardunku.',
  'error.IDEMPOTENCY_KEY_REQUIRED': 'Wani abu ya faru ba daidai ba. Da fatan a sake gwadawa.',
  'error.IDEMPOTENCY_CONFLICT': 'Ana sarrafa wannan bukata tuni.',
  'error.MAPS_UNAVAILABLE':
    'Taswira ba ta samu yanzu. Da fatan a sake gwadawa nan ba da jimawa ba.',
  'error.WALLET_INSUFFICIENT_FUNDS':
    'Kuɗin walat ɗinku bai isa ba. Ƙara kuɗi ko zaɓi wata hanyar biya.',
  'error.WALLET_LIMIT_EXCEEDED': 'Wannan zai wuce iyakar walat ɗinku.',
  'error.OUTSTANDING_BALANCE':
    'Kuna da bashin da ba a biya ba. Da fatan ku biya kafin ku nemi wata tafiya.',
  'error.CARD_NOT_FOUND': 'Ba mu sami wannan kati ba. Zaɓi wani kati ko sake ƙara shi.',
  'error.PAYMENT_PROVIDER_UNAVAILABLE':
    'Biyan kuɗi da kati ba ya samuwa yanzu. Da fatan a sake gwadawa nan ba da jimawa ba.',
  'error.PAYOUT_UNAVAILABLE': 'Ba za ku iya cire wannan kuɗin yanzu ba.',
  'error.PAYOUT_ACCOUNT_RECENTLY_CHANGED':
    'An dakatar da cire kuɗi na awa 24 bayan canza asusun bankinku.',
  'error.REFUND_NOT_ALLOWED': 'Ba za a iya mayar da wannan kuɗin ba.',
  'error.DISPUTE_EXISTS': 'Kun riga kun bayar da rahoton matsala game da wannan tafiya.',
  'error.WEBHOOK_SIGNATURE_INVALID': 'Sa hannu ba daidai ba ne.',
  'error.ROUTE_NOT_FOUND': 'Ba mu sami hanya tsakanin waɗannan wurare ba.',
  'sms.driver_approved':
    'An amince da asusun direbanku na RideswithMe. Buɗe manhajar RideswithMe Driver don fara aiki.',
  'sms.driver_rejected':
    'Bukatar direbanku ta RideswithMe tana bukatar gyara. Buɗe manhajar RideswithMe Driver don ganin abin da za a gyara.',
};

export const catalogs: Record<Language, Record<MessageKey, string>> = { en, ha };

/** Looks up a message and fills {placeholders}. Falls back to English, then to the key. */
export function translate(
  language: Language,
  key: MessageKey,
  params: Record<string, string | number> = {},
): string {
  const template = catalogs[language]?.[key] ?? catalogs[DEFAULT_LANGUAGE][key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
