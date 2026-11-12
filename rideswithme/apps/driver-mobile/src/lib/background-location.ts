import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import type { LocationPoint } from '@rideswithme/validation';
import { LocationBuffer, MemoryBufferStore } from './location-buffer';
import { api } from './session';
import { SqliteBufferStore } from './sqlite-buffer-store';

/**
 * Driver location while online, including with the app in the background or
 * the screen off (Android shows an ongoing notification while it runs).
 * Every reading goes into a durable SQLite buffer first and is uploaded in
 * batches when there is a connection, so readings taken in dead zones arrive
 * later instead of being lost. This module must be imported at app start-up
 * (app/_layout.tsx) because the OS can start the task without any screen.
 */
export const LOCATION_TASK = 'rwm-driver-location';

let buffer: LocationBuffer | null = null;
export function locationBuffer(): LocationBuffer {
  if (!buffer) {
    let store;
    try {
      store = new SqliteBufferStore();
    } catch {
      store = new MemoryBufferStore();
    }
    buffer = new LocationBuffer(store);
  }
  return buffer;
}

export function toPoint(loc: Location.LocationObject): LocationPoint {
  const c = loc.coords;
  return {
    lat: c.latitude,
    lng: c.longitude,
    ...(c.accuracy !== null && c.accuracy >= 0 && { accuracy: Math.min(c.accuracy, 10_000) }),
    ...(c.heading !== null && c.heading >= 0 && c.heading <= 360 && { heading: c.heading }),
    ...(c.speed !== null && c.speed >= 0 && c.speed <= 100 && { speed: c.speed }),
    recordedAt: new Date(loc.timestamp).toISOString(),
  };
}

/** Uploads whatever is buffered (no-op when offline; tried again later). */
export function flushLocations(): Promise<number> {
  return locationBuffer().flush(async (points) => {
    await api.trips.sendLocation({ points });
  });
}

async function record(locations: Location.LocationObject[]) {
  await locationBuffer().add(locations.map(toPoint));
  await flushLocations().catch(() => 0);
}

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
  LOCATION_TASK,
  async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    await record(data.locations);
  },
);

let foreground: Location.LocationSubscription | null = null;

export type TrackingMode = 'background' | 'foreground' | 'denied';

/**
 * Starts sharing location. Asks for "always" access so tracking survives the
 * app going to the background; falls back to while-in-use tracking if refused.
 */
export async function startTracking(notification: {
  title: string;
  body: string;
}): Promise<TrackingMode> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) return 'denied';
  const bg = await Location.requestBackgroundPermissionsAsync().catch(() => ({ granted: false }));
  if (bg.granted) {
    if (!(await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK))) {
      await Location.startLocationUpdatesAsync(LOCATION_TASK, {
        accuracy: Location.Accuracy.High,
        timeInterval: 10_000,
        distanceInterval: 20,
        pausesUpdatesAutomatically: false,
        activityType: Location.ActivityType.AutomotiveNavigation,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: notification.title,
          notificationBody: notification.body,
          notificationColor: '#0F2A43',
        },
      });
    }
    return 'background';
  }
  foreground ??= await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.High, timeInterval: 10_000, distanceInterval: 20 },
    (loc) => {
      void record([loc]);
    },
  );
  return 'foreground';
}

export async function stopTracking(): Promise<void> {
  foreground?.remove();
  foreground = null;
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
  await flushLocations().catch(() => 0);
}
