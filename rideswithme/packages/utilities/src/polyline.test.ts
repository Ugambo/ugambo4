import { describe, expect, it } from 'vitest';
import { decodePolyline, encodePolyline } from './polyline';

describe('polyline', () => {
  // Example from Google's polyline documentation.
  const points = [
    { lat: 38.5, lng: -120.2 },
    { lat: 40.7, lng: -120.95 },
    { lat: 43.252, lng: -126.453 },
  ];

  it('encodes the documented example', () => {
    expect(encodePolyline(points)).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  });

  it('decodes back to the same points', () => {
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual(points);
  });

  it('round-trips Nigerian coordinates', () => {
    const route = [
      { lat: 12.00012, lng: 8.51673 },
      { lat: 12.04761, lng: 8.52462 },
    ];
    expect(decodePolyline(encodePolyline(route))).toEqual(route);
  });
});
