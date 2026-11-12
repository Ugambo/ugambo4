import type { ExpoConfig } from 'expo/config';

/** RideswithMe passenger app. Bundle identifiers are placeholders until store accounts exist. */
const config: ExpoConfig = {
  name: 'RideswithMe',
  slug: 'rideswithme',
  scheme: 'rideswithme',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  ios: { bundleIdentifier: 'com.rideswithme.app', supportsTablet: false },
  android: { package: 'com.rideswithme.app' },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-localization',
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'RideswithMe uses your location to set your pickup point and show nearby drivers.',
      },
    ],
    [
      'react-native-maps',
      { androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY ?? '' },
    ],
  ],
  experiments: { typedRoutes: false },
};

export default config;
