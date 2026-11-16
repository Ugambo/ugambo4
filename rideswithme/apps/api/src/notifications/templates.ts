import type { Language } from '@rideswithme/shared-types';

/**
 * Notification text in English and Hausa, by kind. {name} placeholders are
 * filled from the call's values. Hausa needs native-speaker review.
 */
export const TEMPLATES = {
  sos_acknowledged: {
    en: ['Help is coming', 'Our safety team has your SOS alert and is responding.'],
    ha: ['Taimako na zuwa', 'Ƙungiyar tsaro ta sami faɗakarwar SOS ɗinku kuma tana amsawa.'],
  },
  sos_resolved: {
    en: [
      'SOS alert closed',
      'Our safety team has closed your alert. Contact us if you still need help.',
    ],
    ha: [
      'An rufe faɗakarwar SOS',
      'Ƙungiyar tsaro ta rufe faɗakarwarku. Tuntuɓe mu idan har yanzu kuna buƙatar taimako.',
    ],
  },
  ride_message: {
    en: ['Message from {name}', '{body}'],
    ha: ['Saƙo daga {name}', '{body}'],
  },
  driver_assigned: {
    en: ['Your driver is on the way', '{name} is coming in a {vehicle}, {plate}.'],
    ha: ['Direbanku na zuwa', '{name} na zuwa da {vehicle}, {plate}.'],
  },
  driver_arrived: {
    en: ['Your driver has arrived', '{name} is waiting at the pickup point.'],
    ha: ['Direbanku ya iso', '{name} na jira a wurin ɗauka.'],
  },
  support_reply: {
    en: ['We replied to your request', '{subject}'],
    ha: ['Mun amsa buƙatarku', '{subject}'],
  },
  incident_update: {
    en: ['Update on your report', 'Your report is now {status}.'],
    ha: ['Sabon labari game da rahotonku', 'Rahotonku yanzu {status}.'],
  },
  bus_departure_cancelled: {
    en: [
      'Bus trip cancelled',
      'Your bus {route} on {date} was cancelled: {reason}. {amount} is back in your wallet.',
    ],
    ha: [
      'An soke tafiyar bas',
      'An soke bas ɗinku {route} a ranar {date}: {reason}. An mayar da {amount} a walat ɗinku.',
    ],
  },
  deletion_scheduled: {
    en: [
      'Account deletion requested',
      'Your RideswithMe account will be deleted on {date}. Sign in before then to cancel.',
    ],
    ha: [
      'An nemi a share asusu',
      'Za a share asusunku na RideswithMe a ranar {date}. Shiga kafin nan don soke wannan.',
    ],
  },
  deletion_blocked: {
    en: [
      'Account not deleted yet',
      'We could not delete your account yet: {reason}. We will try again.',
    ],
    ha: [
      'Ba a share asusu ba tukuna',
      'Ba mu iya share asusunku ba tukuna: {reason}. Za mu sake gwadawa.',
    ],
  },
} as const satisfies Record<string, Record<Language, readonly [string, string]>>;

export type NotificationKind = keyof typeof TEMPLATES;

export function render(
  kind: NotificationKind,
  lang: Language,
  values: Record<string, string | number>,
): { title: string; body: string } {
  const [title, body] = TEMPLATES[kind][lang] ?? TEMPLATES[kind].en;
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (m, k: string) => String(values[k] ?? m));
  return { title: fill(title), body: fill(body) };
}
