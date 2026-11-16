import type { ExpoConfig } from 'expo/config';
import { releaseSettings } from '@rideswithme/mobile-core/app-config';

/**
 * RideswithMe Driver. A development build (not Expo Go), because it shares its
 * location in the background. Store builds are made with EAS Build (eas.json);
 * their API address, EAS project and Firebase file come from the EAS
 * environment, and a store build without them is refused (releaseSettings).
 * Bundle identifiers are placeholders until the store accounts exist
 * (DECISIONS B-27). See documentation/LAUNCH.md ("Store builds").
 */
const release = releaseSettings();

const config: ExpoConfig = {
  name: 'RideswithMe Driver',
  slug: 'rideswithme-driver',
  scheme: 'rideswithme-driver',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  owner: release.owner,
  ios: {
    bundleIdentifier: 'com.rideswithme.driver',
    supportsTablet: false,
    config: { usesNonExemptEncryption: false },
  },
  android: {
    package: 'com.rideswithme.driver',
    googleServicesFile: release.googleServicesFile,
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
          'RideswithMe shares your location with passengers and the dispatcher while you are online.',
        locationAlwaysAndWhenInUsePermission:
          'RideswithMe keeps sharing your location while you are online, even when the app is in the background, so you keep getting ride requests and passengers can see you coming.',
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
        isIosBackgroundLocationEnabled: true,
      },
    ],
    [
      'expo-image-picker',
      {
        cameraPermission:
          'RideswithMe uses the camera to photograph your licence, vehicle and profile photo.',
        photosPermission: 'RideswithMe uses your photos so you can upload your documents.',
        microphonePermission: false,
      },
    ],
    ['expo-notifications', { color: '#0F2A43' }],
  ],
  extra: release.extra,
  experiments: { typedRoutes: false },
};

export default config;
