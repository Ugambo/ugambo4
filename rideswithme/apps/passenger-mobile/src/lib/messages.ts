import { passengerMessages } from '@rideswithme/utilities';

/**
 * Passenger app text. Ride text shared with the website comes from
 * @rideswithme/utilities; sign-in and common text from @rideswithme/mobile-core.
 * Every key must exist in Hausa (the type enforces it). Hausa needs native-speaker review.
 */
const en = {
  ...passengerMessages.en,
  'signIn.title': 'Ride with RideswithMe',
  'signIn.subtitle': 'Sign in with your phone number to book cars and Keke Napep.',
  'home.whereTo': 'Where to?',
  'home.pickup': 'Pickup',
  'home.yourLocation': 'Your location',
  'home.locating': 'Finding your location…',
  'home.locationDenied':
    'Allow location access to set your pickup automatically, or search for it.',
  'home.history': 'Your rides',
  'home.account': 'Account',
  'home.sheetHandle': 'Show more or less',
  'account.title': 'Account',
  'account.savedPlaces': 'Saved places',
  'account.notSet': 'Not set',
};

export type MessageKey = keyof typeof en;

const ha: Record<MessageKey, string> = {
  ...passengerMessages.ha,
  'signIn.title': 'Tafi da RideswithMe',
  'signIn.subtitle': 'Shiga da lambar wayarku don yin odar mota da Keke Napep.',
  'home.whereTo': 'Ina za ku?',
  'home.pickup': 'Wurin ɗauka',
  'home.yourLocation': 'Wurin da kuke',
  'home.locating': 'Ana neman wurin da kuke…',
  'home.locationDenied': 'Ba da izinin wuri don a saita wurin ɗauka kai tsaye, ko ku nema shi.',
  'home.history': 'Tafiye-tafiyenku',
  'home.account': 'Asusu',
  'home.sheetHandle': 'Nuna ƙari ko ƙasa',
  'account.title': 'Asusu',
  'account.savedPlaces': 'Wuraren da aka adana',
  'account.notSet': 'Ba a saita ba',
};

export const messages = { en, ha };
