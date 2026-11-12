/** Text shared by both mobile apps (sign-in, common states). Apps add their own on top. */
export const commonEn = {
  'common.continue': 'Continue',
  'common.save': 'Save',
  'common.retry': 'Try again',
  'common.loading': 'Loading…',
  'common.offline':
    'No internet connection. You can keep going; we will try again when you are back online.',
  'common.language': 'Language',
  'common.signOut': 'Sign out',
  'common.back': 'Back',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'signIn.phone': 'Phone number',
  'signIn.phoneHint': 'e.g. 0803 123 4567',
  'signIn.sendCode': 'Send code',
  'signIn.code': 'Enter the 6-digit code we sent to {phone}',
  'signIn.verify': 'Sign in',
  'signIn.resend': 'Send a new code',
  'signIn.resendIn': 'Send a new code in {seconds}s',
  'signIn.changeNumber': 'Change number',
  'signIn.consent': 'By continuing you accept the RideswithMe terms and privacy policy.',
} as const;

export type CommonKey = keyof typeof commonEn;

export const commonHa: Record<CommonKey, string> = {
  'common.continue': 'Ci gaba',
  'common.save': 'Adana',
  'common.retry': 'Sake gwadawa',
  'common.loading': 'Ana lodawa…',
  'common.offline': 'Babu intanet. Kuna iya ci gaba; za mu sake gwadawa idan intanet ya dawo.',
  'common.language': 'Harshe',
  'common.signOut': 'Fita',
  'common.back': 'Koma baya',
  'common.cancel': 'Soke',
  'common.close': 'Rufe',
  'signIn.phone': 'Lambar waya',
  'signIn.phoneHint': 'misali 0803 123 4567',
  'signIn.sendCode': 'Aika lamba',
  'signIn.code': 'Shigar da lambar 6 da muka aika zuwa {phone}',
  'signIn.verify': 'Shiga',
  'signIn.resend': 'Aika sabuwar lamba',
  'signIn.resendIn': 'Aika sabuwar lamba bayan daƙiƙa {seconds}',
  'signIn.changeNumber': 'Canza lamba',
  'signIn.consent': 'Ta ci gaba, kun yarda da sharuɗɗa da manufar sirri ta RideswithMe.',
};
