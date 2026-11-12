import { passengerMessages } from '@rideswithme/utilities';

/**
 * Passenger website text. Ride text shared with the passenger app comes from
 * @rideswithme/utilities. Every key must exist in Hausa (the type enforces it).
 * Hausa needs native-speaker review.
 */
const en = {
  ...passengerMessages.en,
  'app.name': 'RideswithMe',
  'common.signOut': 'Sign out',
  'common.language': 'Language',
  'common.retry': 'Try again',
  'common.loading': 'Loading…',
  'common.loadMore': 'Load more',
  'common.back': 'Back',
  'common.offline': 'You are offline. We will update this page when the connection returns.',
  'common.reconnecting': 'Reconnecting… live updates are paused.',

  'nav.book': 'Book a ride',
  'nav.rides': 'Your rides',
  'nav.getApp': 'For live maps on the move, use the RideswithMe app.',

  'signIn.title': 'Ride with RideswithMe',
  'signIn.subtitle': 'Sign in with your phone number to book cars and Keke Napep.',
  'signIn.phone': 'Phone number',
  'signIn.phoneHint': 'Nigerian mobile number, e.g. 0803 123 4567',
  'signIn.sendCode': 'Send code',
  'signIn.code': '6-digit code',
  'signIn.codeSent': 'We sent a code by SMS to {phone}.',
  'signIn.verify': 'Sign in',
  'signIn.changeNumber': 'Use a different number',
  'signIn.consent': 'By signing in you accept the RideswithMe terms and privacy policy.',

  'book.title': 'Where are you going?',
  'book.pickup': 'Pickup',
  'book.destination': 'Destination',
  'book.useLocation': 'Use my location',
  'book.locating': 'Finding your location…',
  'book.locationFailed': 'We could not get your location. Search for your pickup instead.',
  'book.change': 'Change',
  'book.pricing': 'Getting prices…',
  'book.tripSummary': '{distance} km · about {minutes} min',
  'book.mapNote': 'Route sketch. Live street maps arrive with the map key.',
  'book.scheduledRides': 'Scheduled rides',
  'book.requesting': 'Requesting…',

  'map.pickup': 'Pickup',
  'map.destination': 'Destination',
  'map.driver': 'Driver',
  'map.label': 'Sketch of the route from pickup to destination',

  'rides.when': 'When',
  'rides.from': 'From',
  'rides.to': 'To',
  'rides.distance': 'Distance driven',
  'rides.distanceKm': '{km} km',
  'rides.view': 'Details',
} as const;

export type MessageKey = keyof typeof en;

const ha: Record<MessageKey, string> = {
  ...passengerMessages.ha,
  'app.name': 'RideswithMe',
  'common.signOut': 'Fita',
  'common.language': 'Harshe',
  'common.retry': 'Sake gwadawa',
  'common.loading': 'Ana lodawa…',
  'common.loadMore': 'Ƙara nunawa',
  'common.back': 'Koma baya',
  'common.offline': 'Ba ku da intanet. Za mu sabunta wannan shafi idan haɗin ya dawo.',
  'common.reconnecting': 'Ana sake haɗawa… an dakatar da sabuntawa kai tsaye.',

  'nav.book': 'Nemi abin hawa',
  'nav.rides': 'Tafiye-tafiyenku',
  'nav.getApp': 'Don taswira kai tsaye a hanya, yi amfani da manhajar RideswithMe.',

  'signIn.title': 'Tafi da RideswithMe',
  'signIn.subtitle': 'Shiga da lambar wayarku don yin odar mota da Keke Napep.',
  'signIn.phone': 'Lambar waya',
  'signIn.phoneHint': 'Lambar wayar Najeriya, misali 0803 123 4567',
  'signIn.sendCode': 'Aika lamba',
  'signIn.code': 'Lamba mai haruffa 6',
  'signIn.codeSent': 'Mun aika lamba ta SMS zuwa {phone}.',
  'signIn.verify': 'Shiga',
  'signIn.changeNumber': 'Yi amfani da wata lamba',
  'signIn.consent': 'Ta hanyar shiga kun amince da sharuɗɗa da manufar sirri ta RideswithMe.',

  'book.title': 'Ina za ku?',
  'book.pickup': 'Wurin ɗauka',
  'book.destination': 'Inda za ku',
  'book.useLocation': 'Yi amfani da wurin da nake',
  'book.locating': 'Ana neman wurin da kuke…',
  'book.locationFailed': 'Ba mu sami wurin da kuke ba. Ku nemi wurin ɗauka maimakon haka.',
  'book.change': 'Canza',
  'book.pricing': 'Ana samo farashi…',
  'book.tripSummary': 'km {distance} · kusan minti {minutes}',
  'book.mapNote': 'Zanen hanya. Taswirar tituna kai tsaye za ta zo tare da maɓallin taswira.',
  'book.scheduledRides': 'Tafiye-tafiyen da aka tsara',
  'book.requesting': 'Ana nema…',

  'map.pickup': 'Wurin ɗauka',
  'map.destination': 'Inda za ku',
  'map.driver': 'Direba',
  'map.label': 'Zanen hanya daga wurin ɗauka zuwa inda za ku',

  'rides.when': 'Yaushe',
  'rides.from': 'Daga',
  'rides.to': 'Zuwa',
  'rides.distance': 'Nisan da aka tuƙa',
  'rides.distanceKm': 'km {km}',
  'rides.view': 'Bayani',
};

export const messages = { en, ha };
