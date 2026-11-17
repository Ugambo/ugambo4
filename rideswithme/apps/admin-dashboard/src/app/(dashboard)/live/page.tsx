'use client';

import type * as Leaflet from 'leaflet';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LiveDriver, LiveRide, LiveView } from '@rideswithme/shared-types';
import { LeafletMap, type L } from '@/components/map';
import { ErrorState, Loading } from '@/components/states';
import { api } from '@/lib/api';
import { useConfig } from '@/lib/config';
import { useI18n } from '@/lib/i18n';
import { staffRealtime } from '@/lib/realtime';

/** Positions older than this are drawn grey and labelled with their age, never as live. */
const STALE_SECONDS = 30;
const ACTIVE = new Set(['searching', 'driver_assigned', 'driver_arrived', 'in_progress']);

/** Online drivers and active rides, kept current over the realtime connection (ops room). */
export default function LivePage() {
  const { t } = useI18n();
  const { apiPublicUrl } = useConfig();
  const [drivers, setDrivers] = useState<Map<string, LiveDriver>>(new Map());
  const [rides, setRides] = useState<Map<string, LiveRide>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const mapRef = useRef<{ map: Leaflet.Map; L: L; layer: Leaflet.LayerGroup } | null>(null);

  const load = useCallback(async () => {
    try {
      const v: LiveView = await api().admin.live();
      setDrivers(new Map(v.drivers.map((d) => [d.driverId, d])));
      setRides(new Map(v.rides.map((r) => [r.id, r])));
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    if (!apiPublicUrl) {
      // No live connection configured: refresh every 15 seconds instead.
      const poll = setInterval(() => void load(), 15_000);
      return () => {
        clearInterval(tick);
        clearInterval(poll);
      };
    }
    const rt = staffRealtime(apiPublicUrl);
    const subscribe = () => void rt.request('ops:subscribe', {}).catch(() => undefined);
    const offs = [
      rt.onStatus((up) => {
        setConnected(up);
        if (up) subscribe();
      }),
      // Anything missed while disconnected: reload the whole picture.
      rt.onReconnect(() => void load()),
      rt.on<LiveDriver>('ops:driver', (d) =>
        setDrivers((m) =>
          new Map(m).set(d.driverId, {
            ...m.get(d.driverId),
            ...d,
            name: m.get(d.driverId)?.name ?? null,
          }),
        ),
      ),
      rt.on<LiveRide>('ops:ride', (r) =>
        setRides((m) => {
          const next = new Map(m);
          if (ACTIVE.has(r.status)) next.set(r.id, r);
          else next.delete(r.id);
          return next;
        }),
      ),
    ];
    rt.start();
    return () => {
      clearInterval(tick);
      offs.forEach((off) => off());
      rt.stop();
    };
  }, [apiPublicUrl, load]);

  // Redraw markers whenever positions change or time passes (staleness).
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    m.layer.clearLayers();
    for (const r of rides.values()) {
      m.L.circleMarker([r.pickup.lat, r.pickup.lng], {
        radius: 6,
        color: '#ffffff',
        weight: 2,
        fillColor: '#1baf7a',
        fillOpacity: 1,
      })
        .bindTooltip(
          `${r.category} · ${t(`rideStatus.${r.status}` as never)} · ${r.pickup.address}`,
        )
        .addTo(m.layer);
    }
    for (const d of drivers.values()) {
      const age = Math.max(0, Math.round((now - Date.parse(d.receivedAt)) / 1000));
      const stale = age > STALE_SECONDS;
      m.L.circleMarker([d.lat, d.lng], {
        radius: 8,
        color: '#ffffff',
        weight: 2,
        fillColor: stale ? '#9a9a9a' : d.rideId ? '#2a78d6' : '#eda100',
        fillOpacity: 1,
      })
        .bindTooltip(
          `${d.name ?? '—'} · ${d.rideId ? t('live.onRide') : t('live.available')} · ${t('live.updated', { seconds: age })}`,
        )
        .addTo(m.layer);
    }
  }, [drivers, rides, now, t]);

  if (!loaded) return <Loading />;
  if (error && drivers.size === 0) return <ErrorState error={error} onRetry={() => void load()} />;

  const first = [...drivers.values()][0] ?? [...rides.values()][0]?.pickup;
  // With nobody online, show Katsina city, the primary service area.
  const center: [number, number] = first ? [first.lat, first.lng] : [12.99, 7.6];
  const list = [...drivers.values()].sort(
    (a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt),
  );

  return (
    <>
      <div className="page-header">
        <h1>{t('live.title')}</h1>
        <span className={`pill ${connected ? 'pill-ok' : 'pill-wait'}`} data-testid="live-status">
          {connected ? t('live.connected') : t('live.reconnecting')}
        </span>
      </div>
      <p className="muted">{t('live.summary', { drivers: drivers.size, rides: rides.size })}</p>
      <LeafletMap
        label={t('live.title')}
        center={center}
        zoom={13}
        onReady={(map, L) => {
          mapRef.current = { map, L, layer: L.layerGroup().addTo(map) };
          setNow(Date.now());
        }}
      />
      <p className="small muted">{t('live.mapNote')}</p>
      <div className="table-wrap">
        <table data-testid="live-drivers">
          <caption className="visually-hidden">{t('live.drivers')}</caption>
          <thead>
            <tr>
              <th>{t('col.driver')}</th>
              <th>{t('col.status')}</th>
              <th className="num">{t('live.updated', { seconds: '…' })}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((d) => {
              const age = Math.max(0, Math.round((now - Date.parse(d.receivedAt)) / 1000));
              return (
                <tr key={d.driverId} className={age > STALE_SECONDS ? 'muted' : undefined}>
                  <td>{d.name ?? '—'}</td>
                  <td>{d.rideId ? t('live.onRide') : t('live.available')}</td>
                  <td className="num">{t('live.updated', { seconds: age })}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
