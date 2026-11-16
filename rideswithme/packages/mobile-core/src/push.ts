import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import type { ApiClient } from '@rideswithme/api-client';

// Show notifications that arrive while the app is open, too.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Registers this phone for push notifications once the person is signed in:
 * asks for permission (Android 13+ and iOS), creates the Android channel, and
 * sends the Expo push token to the API. Needs a development or store build
 * with an EAS project id (app config `extra.eas.projectId`); quietly does
 * nothing on simulators or without one.
 */
export function usePushRegistration(
  api: ApiClient,
  app: 'passenger' | 'driver',
  signedIn: boolean,
) {
  useEffect(() => {
    if (!signedIn || !Device.isDevice) return;
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
      ?.eas?.projectId;
    if (!projectId) return;
    void (async () => {
      try {
        if (Platform.OS === 'android')
          await Notifications.setNotificationChannelAsync('default', {
            name: 'RideswithMe',
            importance: Notifications.AndroidImportance.HIGH,
          });
        let { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
        if (status !== 'granted') return;
        const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
        await api.notifications.registerPushToken({
          token,
          app,
          platform: Platform.OS === 'ios' ? 'ios' : 'android',
        });
      } catch {
        // Push is a convenience: the app still works (live updates, inbox) without it.
      }
    })();
  }, [api, app, signedIn]);
}
