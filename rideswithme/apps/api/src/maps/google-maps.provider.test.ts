import { describe, expect, it, vi } from 'vitest';
import { GoogleMapsProvider } from './google-maps.provider';
import { MapsUnavailableError } from './maps.provider';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('GoogleMapsProvider', () => {
  it('limits autocomplete to Nigeria, biases near the user and sends the key in a header', async () => {
    const fetchMock = vi.fn(async () =>
      json({
        suggestions: [
          {
            placePrediction: {
              placeId: 'p1',
              structuredFormat: {
                mainText: { text: 'Kurmi Market' },
                secondaryText: { text: 'Kano' },
              },
            },
          },
        ],
      }),
    );
    const g = new GoogleMapsProvider('KEY', fetchMock as never);
    const res = await g.autocomplete('kurmi', {
      language: 'ha',
      near: { lat: 12, lng: 8.5 },
      sessionToken: 'tok12345',
    });
    expect(res).toEqual([{ placeId: 'p1', primaryText: 'Kurmi Market', secondaryText: 'Kano' }]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://places.googleapis.com/v1/places:autocomplete');
    expect((init.headers as Record<string, string>)['X-Goog-Api-Key']).toBe('KEY');
    expect(JSON.parse(init.body as string)).toMatchObject({
      input: 'kurmi',
      includedRegionCodes: ['ng'],
      languageCode: 'ha',
      sessionToken: 'tok12345',
      locationBias: { circle: { center: { latitude: 12, longitude: 8.5 } } },
    });
  });

  it('asks Routes API for distance, duration and polyline only', async () => {
    const fetchMock = vi.fn(async () =>
      json({
        routes: [{ distanceMeters: 5400, duration: '780s', polyline: { encodedPolyline: 'abc' } }],
      }),
    );
    const g = new GoogleMapsProvider('KEY', fetchMock as never);
    expect(await g.route({ lat: 12, lng: 8.5 }, { lat: 12.05, lng: 8.52 })).toEqual({
      distanceMeters: 5400,
      durationSeconds: 780,
      polyline: 'abc',
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['X-Goog-FieldMask']).toBe(
      'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
    );
  });

  it('returns null when there is no route, and raises MapsUnavailableError on failures', async () => {
    expect(
      await new GoogleMapsProvider('K', vi.fn(async () => json({})) as never).route(
        { lat: 1, lng: 1 },
        { lat: 2, lng: 2 },
      ),
    ).toBeNull();
    await expect(
      new GoogleMapsProvider('K', vi.fn(async () => json({}, 403)) as never).route(
        { lat: 1, lng: 1 },
        { lat: 2, lng: 2 },
      ),
    ).rejects.toBeInstanceOf(MapsUnavailableError);
    await expect(
      new GoogleMapsProvider(
        'K',
        vi.fn(async () => {
          throw new TypeError('network');
        }) as never,
      ).autocomplete('x', { language: 'en' }),
    ).rejects.toBeInstanceOf(MapsUnavailableError);
  });
});
