/**
 * Support request text shared by the passenger app, the passenger website and
 * the driver app: contacting support, the list of requests and the thread.
 * Every key must exist in Hausa (the type enforces it).
 */
const en = {
  'help.title': 'Help',
  'help.new': 'Contact support',
  'help.category': 'About',
  'help.subject': 'Subject',
  'help.body': 'How can we help?',
  'help.send': 'Send',
  'help.requests': 'Your requests',
  'help.none': 'No requests yet.',
  'help.reports': 'Your reports',
  'help.reply': 'Reply',
  'help.support': 'RideswithMe support',
  'help.you': 'You',
  'ticketStatus.open': 'Waiting for us',
  'ticketStatus.waiting_on_user': 'We replied',
  'ticketStatus.resolved': 'Resolved',
  'ticketCategory.payment': 'Payment',
  'ticketCategory.ride': 'A ride',
  'ticketCategory.bus': 'A bus trip',
  'ticketCategory.account': 'My account',
  'ticketCategory.driver': 'Driving with RideswithMe',
  'ticketCategory.other': 'Something else',
} as const;

export type SupportMessageKey = keyof typeof en;

const ha: Record<SupportMessageKey, string> = {
  'help.title': 'Taimako',
  'help.new': 'Tuntuɓi tallafi',
  'help.category': 'Game da',
  'help.subject': 'Batu',
  'help.body': 'Ta yaya za mu taimaka?',
  'help.send': 'Aika',
  'help.requests': 'Buƙatunku',
  'help.none': 'Babu buƙata tukuna.',
  'help.reports': 'Rahotanninku',
  'help.reply': 'Amsa',
  'help.support': 'Tallafin RideswithMe',
  'help.you': 'Ku',
  'ticketStatus.open': 'Ana jiran mu',
  'ticketStatus.waiting_on_user': 'Mun amsa',
  'ticketStatus.resolved': 'An warware',
  'ticketCategory.payment': 'Biyan kuɗi',
  'ticketCategory.ride': 'Tafiya',
  'ticketCategory.bus': 'Tafiyar bas',
  'ticketCategory.account': 'Asusuna',
  'ticketCategory.driver': 'Tuƙi da RideswithMe',
  'ticketCategory.other': 'Wani abu dabam',
};

export const supportMessages = { en, ha };
