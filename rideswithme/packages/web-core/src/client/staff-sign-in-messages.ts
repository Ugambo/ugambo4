/**
 * Text for the staff sign-in (SMS code, then an authenticator app), shared by
 * the admin dashboard and the fleet portal. Each app adds its own
 * 'login.title' and 'login.noAccess'. Hausa needs native-speaker review.
 */
const en = {
  'login.phone': 'Phone number',
  'login.phoneHint': 'The number registered to your staff account, e.g. 0803 123 4567',
  'login.sendCode': 'Send code',
  'login.code': '6-digit code',
  'login.codeSent': 'We sent a code by SMS to {phone}.',
  'login.verify': 'Sign in',
  'login.changeNumber': 'Use a different number',
  'login.consent': 'By signing in you accept the RideswithMe terms and privacy policy.',
  'login.mfaSetupTitle': 'Set up two-factor authentication',
  'login.mfaSetupBody':
    'Staff accounts need an authenticator app. Scan this code with Google Authenticator, Microsoft Authenticator or Authy, then enter the 6-digit code it shows.',
  'login.mfaSecret': 'Or enter this key by hand',
  'login.mfaCode': 'Code from your authenticator app',
  'login.mfaVerifyTitle': 'Enter your authenticator code',
  'login.mfaVerifyBody': 'Open your authenticator app and enter the 6-digit code for RideswithMe.',
  'login.continue': 'Continue',
} as const;

export type StaffSignInKey = keyof typeof en;

const ha: Record<StaffSignInKey, string> = {
  'login.phone': 'Lambar waya',
  'login.phoneHint': 'Lambar da aka yi wa asusun ma’aikaci rajista, misali 0803 123 4567',
  'login.sendCode': 'Aika lamba',
  'login.code': 'Lamba mai lamba 6',
  'login.codeSent': 'Mun aika lamba ta SMS zuwa {phone}.',
  'login.verify': 'Shiga',
  'login.changeNumber': 'Yi amfani da wata lamba',
  'login.consent': 'Ta shiga, kun yarda da sharuɗɗa da manufar sirri ta RideswithMe.',
  'login.mfaSetupTitle': 'Saita tantancewa mataki biyu',
  'login.mfaSetupBody':
    'Asusun ma’aikata na bukatar manhajar tantancewa. Duba wannan lamba da Google Authenticator, Microsoft Authenticator ko Authy, sannan shigar da lambar 6 da ta nuna.',
  'login.mfaSecret': 'Ko shigar da wannan maɓalli da hannu',
  'login.mfaCode': 'Lamba daga manhajar tantancewarku',
  'login.mfaVerifyTitle': 'Shigar da lambar tantancewarku',
  'login.mfaVerifyBody': 'Buɗe manhajar tantancewarku kuma shigar da lambar 6 ta RideswithMe.',
  'login.continue': 'Ci gaba',
};

export const staffSignInMessages = { en, ha };
