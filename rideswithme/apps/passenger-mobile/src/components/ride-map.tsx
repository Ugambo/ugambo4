import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import type { LatLng } from '@rideswithme/shared-types';
import { colors } from '@rideswithme/ui-components';
import { decodePolyline } from '@rideswithme/utilities';

const NIGERIA = { latitude: 9.08, longitude: 8.68, latitudeDelta: 9, longitudeDelta: 9 };
const toCoord = (p: LatLng) => ({ latitude: p.lat, longitude: p.lng });

/** Full-screen map with pickup, destination, driver and route. Re-fits when they change. */
export function RideMap({
  pickup,
  dropoff,
  driver,
  polyline,
  bottomInset,
  showsUserLocation = true,
}: {
  pickup?: LatLng | null;
  dropoff?: LatLng | null;
  driver?: LatLng | null;
  polyline?: string | null;
  bottomInset: number;
  showsUserLocation?: boolean;
}) {
  const ref = useRef<MapView>(null);
  const route = useMemo(() => (polyline ? decodePolyline(polyline).map(toCoord) : []), [polyline]);
  const points = useMemo(
    () => [pickup, dropoff, driver].filter((p): p is LatLng => !!p).map(toCoord),
    [pickup, dropoff, driver],
  );

  useEffect(() => {
    if (!ref.current || points.length === 0) return;
    if (points.length === 1) {
      ref.current.animateToRegion(
        { ...points[0]!, latitudeDelta: 0.02, longitudeDelta: 0.02 },
        400,
      );
    } else {
      ref.current.fitToCoordinates([...points, ...route], {
        edgePadding: { top: 80, right: 60, bottom: bottomInset + 40, left: 60 },
        animated: true,
      });
    }
  }, [points, route, bottomInset]);

  return (
    <MapView
      ref={ref}
      style={StyleSheet.absoluteFill}
      initialRegion={NIGERIA}
      showsUserLocation={showsUserLocation}
      toolbarEnabled={false}
    >
      {route.length > 1 && (
        <Polyline coordinates={route} strokeColor={colors.primary} strokeWidth={5} />
      )}
      {pickup && <Marker coordinate={toCoord(pickup)} pinColor={colors.success} />}
      {dropoff && <Marker coordinate={toCoord(dropoff)} pinColor={colors.primary} />}
      {driver && <Marker coordinate={toCoord(driver)} pinColor={colors.accent} />}
    </MapView>
  );
}
