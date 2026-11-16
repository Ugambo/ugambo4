import type { ExpoConfig } from 'expo/config';
import { releaseSettings } from '@rideswithme/mobile-core/app-config';

/**
 * RideswithMe passenger app. Store builds are made with EAS Build (eas.json);
 * their API address, EAS project and Firebase file come from the EAS
 * environment, and a store build without them is refused (releaseSettings).
 * Bundle identifiers are placeholders until the store accounts exist
 * (DECISIONS B-27). See documentation/LAUNCH.md ("Store builds").
 */
const release = releaseSettings();

const config: ExpoConfig = {
  name: 'RideswithMe',
  slug: 'rideswithme',
  scheme: 'rideswithme',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  owner: release.owner,
  ios: {
    bundleIdentifier: 'com.rideswithme.app',
    supportsTablet: false,
    config: { usesNonExemptEncryption: false },
  },
  android: {
    package: 'com.rideswithme.app',
    googleServicesFile: release.googleServicesFile,
    // Nothing in the app records audio; some libraries declare it anyway.
    blockedPermissions: ['android.permission.RECORD_AUDIO'],
  },
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
    ['expo-notifications', { color: '#0F2A43' }],
  ],
  extra: release.extra,
  experiments: { typedRoutes: false },
};

export default config;
