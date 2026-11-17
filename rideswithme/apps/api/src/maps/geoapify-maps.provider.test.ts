import { decodePolyline } from '@rideswithme/utilities';
import { describe, expect, it, vi } from 'vitest';
import { GeoapifyMapsProvider } from './geoapify-maps.provider';
import { MapsUnavailableError } from './maps.provider';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const KATSINA = { lat: 12.99, lng: 7.6 };
const urlOf = (m: ReturnType<typeof vi.fn>) => new URL((m.mock.calls[0] as unknown as [string])[0]);

describe('GeoapifyMapsProvider', () => {
  it('limits search to Nigeria and prefers places near the user, or Katsina when unknown', async () => {
    const fetchMock = vi.fn(async () =>
      json({
        results: [
          {
            place_id: 'abc123',
            address_line1: 'Kofar Kaura',
            address_line2: 'IBB Way, Katsina, Nigeria',
            lat: 12.98,
            lon: 7.6,
          },
          { address_line1: 'No id, skipped', lat: 1, lon: 1 },
        ],
      }),
    );
    const g = new GeoapifyMapsProvider('KEY1234567890ABCDEF', KATSINA, fetchMock as never);
    const res = await g.autocomplete('kofar', { language: 'ha' });
    expect(res).toEqual([
      { placeId: 'abc123', primaryText: 'Kofar Kaura', secondaryText: 'IBB Way, Katsina, Nigeria' },
    ]);
    const url = urlOf(fetchMock);
    expect(url.pathname).toBe('/v1/geocode/autocomplete');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      text: 'kofar',
      filter: 'countrycode:ng',
      bias: 'proximity:7.6,12.99',
      lang: 'ha',
      apiKey: 'KEY1234567890ABCDEF',
    });

    fetchMock.mockClear();
    await g.autocomplete('kofar', { language: 'en', near: { lat: 11, lng: 8 } });
    expect(urlOf(fetchMock).searchParams.get('bias')).toBe('proximity:8,11');
  });

  it('gives place details, and null for an unknown place', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          features: [
            {
              properties: {
                name: 'Gobarau Minaret',
                formatted: 'Gobarau Minaret, Katsina, Nigeria',
                lat: 12.9934,
                lon: 7.6012,
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(json({ error: 'Bad Request' }, 400));
    const g = new GeoapifyMapsProvider('KEY1234567890ABCDEF', KATSINA, fetchMock as never);
    expect(await g.placeDetails('p1', { language: 'en' })).toEqual({
      placeId: 'p1',
      name: 'Gobarau Minaret',
      address: 'Gobarau Minaret, Katsina, Nigeria',
      location: { lat: 12.9934, lng: 7.6012 },
    });
    expect(await g.placeDetails('nope', { language: 'en' })).toBeNull();
  });

  it('reverse geocodes, falling back to coordinates when nothing is found', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({ results: [{ place_id: 'r1', formatted: 'IBB Way, Katsina', lat: 0, lon: 0 }] }),
      )
      .mockResolvedValueOnce(json({ results: [] }));
    const g = new GeoapifyMapsProvider('KEY1234567890ABCDEF', KATSINA, fetchMock as never);
    const at = { lat: 12.9897, lng: 7.6022 };
    expect(await g.reverseGeocode(at, 'en')).toEqual({
      placeId: 'r1',
      address: 'IBB Way, Katsina',
      location: at,
    });
    expect((await g.reverseGeocode(at, 'en')).address).toBe('12.98970, 7.60220');
  });

  it('turns a driving route into distance, time and an encoded polyline', async () => {
    const fetchMock = vi.fn(async () =>
      json({
        features: [
          {
            properties: { distance: 13308.4, time: 1414.19 },
            geometry: {
              type: 'MultiLineString',
              coordinates: [
                [
                  [7.6307, 12.9577],
                  [7.64, 12.97],
                ],
                [
                  [7.64, 12.97],
                  [7.6604, 13.0078],
                ],
              ],
            },
          },
        ],
      }),
    );
    const g = new GeoapifyMapsProvider('KEY1234567890ABCDEF', KATSINA, fetchMock as never);
    const r = await g.route({ lat: 12.9577, lng: 7.6307 }, { lat: 13.0078, lng: 7.6604 });
    expect(r).toMatchObject({ distanceMeters: 13308, durationSeconds: 1414 });
    const points = decodePolyline(r!.polyline!);
    expect(points[0]).toEqual({ lat: 12.9577, lng: 7.6307 });
    expect(points.at(-1)).toEqual({ lat: 13.0078, lng: 7.6604 });
    expect(urlOf(fetchMock).searchParams.get('waypoints')).toBe('12.9577,7.6307|13.0078,7.6604');
  });

  it('reports failures without the key in the message', async () => {
    const g = new GeoapifyMapsProvider(
      'SECRETKEY123456789',
      KATSINA,
      vi.fn(async () => json({}, 401)) as never,
    );
    const err = await g.autocomplete('x', { language: 'en' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MapsUnavailableError);
    expect((err as Error).message).not.toContain('SECRETKEY');
  });
});
