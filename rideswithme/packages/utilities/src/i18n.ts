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
