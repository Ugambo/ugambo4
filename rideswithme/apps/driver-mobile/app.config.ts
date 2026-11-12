import type { ExpoConfig } from 'expo/config';

/**
 * RideswithMe Driver. Built as an Expo development build (not Expo Go), because
 * background location arrives in Phase 4. Bundle identifiers are placeholders
 * until the company's domain and store accounts are confirmed.
 */
const config: ExpoConfig = {
  name: 'RideswithMe Driver',
  slug: 'rideswithme-driver',
  scheme: 'rideswithme-driver',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: 'com.rideswithme.driver',
    supportsTablet: false,
  },
  android: {
    package: 'com.rideswithme.driver',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-localization',
    [
      'expo-image-picker',
      {
        cameraPermission:
          'RideswithMe uses the camera to photograph your licence, vehicle and profile photo.',
        photosPermission: 'RideswithMe uses your photos so you can upload your documents.',
        microphonePermission: false,
      },
    ],
  ],
  experiments: { typedRoutes: false },
};

export default config;
