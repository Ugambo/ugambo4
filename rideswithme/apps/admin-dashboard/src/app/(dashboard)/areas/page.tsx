'use client';

import type * as Leaflet from 'leaflet';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import type { ServiceAreaView } from '@rideswithme/shared-types';
import { useResource } from '@rideswithme/web-core/client';
import { LeafletMap, type L } from '@/components/map';
import { ErrorState, InlineError, Loading } from '@/components/states';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useCan } from '../shell';

type Corner = [number, number]; // [lat, lng]

/** Service areas drawn on the map. Click to add corners, drag to move them; saving replaces the area by key. */
export default function AreasPage() {
  const { t } = useI18n();
  const can = useCan();
  const editable = can('service_areas.manage');
  const areas = useResource(() => api().admin.pricing.serviceAreas(), []);
  const [editing, setEditing] = useState<{
    key: string;
    name: string;
    isActive: boolean;
    isNew: boolean;
  } | null>(null);
  const [corners, setCorners] = useState<Corner[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const mapRef = useRef<{
    map: Leaflet.Map;
    L: L;
    areas: Leaflet.LayerGroup;
    draft: Leaflet.LayerGroup;
  } | null>(null);
  const editingRef = useRef(editing);
  editingRef.current = editing;

  // Existing areas.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !areas.data) return;
    m.areas.clearLayers();
    for (const a of areas.data) {
      if (editing && a.key === editing.key) continue;
      for (const poly of a.boundary.coordinates) {
        m.L.polygon(
          poly[0]!.map(([lng, lat]) => [lat, lng] as Corner),
          {
            color: a.isActive ? '#2a78d6' : '#9a9a9a',
            weight: 2,
            fillOpacity: 0.08,
          },
        )
          .bindTooltip(`${a.name}${a.isActive ? '' : ` · ${t('areas.inactive')}`}`)
          .addTo(m.areas);
      }
    }
  }, [areas.data, editing, t]);

  // The area being drawn: a polygon and a draggable marker per corner.
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    m.draft.clearLayers();
    if (!editing) return;
    if (corners.length >= 2)
      m.L.polygon(corners, { color: '#eb6834', weight: 2, fillOpacity: 0.15 }).addTo(m.draft);
    corners.forEach((c, i) => {
      const marker = m.L.marker(c, {
        draggable: true,
        keyboard: true,
        title: `${i + 1}`,
        // A CSS handle: Leaflet's default marker images do not survive bundling.
        icon: m.L.divIcon({ className: 'corner-handle', iconSize: [16, 16] }),
      }).addTo(m.draft);
      marker.on('dragend', () => {
        const p = marker.getLatLng();
        setCorners((cs) => cs.map((x, j) => (j === i ? ([p.lat, p.lng] as Corner) : x)));
      });
    });
  }, [corners, editing]);

  if (areas.loading && !areas.data) return <Loading />;
  if (areas.error) return <ErrorState error={areas.error} onRetry={() => void areas.reload()} />;

  const start = (a: ServiceAreaView | null) => {
    setSaved(false);
    setError(null);
    if (a) {
      setEditing({ key: a.key, name: a.name, isActive: a.isActive, isNew: false });
      const ring = a.boundary.coordinates[0]![0]!.map(([lng, lat]) => [lat, lng] as Corner);
      setCorners(ring.slice(0, -1)); // drop the closing point
    } else {
      setEditing({ key: '', name: '', isActive: true, isNew: true });
      setCorners([]);
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setError(null);
    if (corners.length < 3) {
      setError(new Error(t('areas.tooFew')));
      return;
    }
    const ring = [...corners, corners[0]!].map(([lat, lng]) => [lng, lat] as [number, number]);
    try {
      await api().admin.pricing.saveServiceArea({
        key: editing.key,
        name: editing.name,
        isActive: editing.isActive,
        boundary: { type: 'Polygon', coordinates: [ring] },
      });
      setSaved(true);
      setEditing(null);
      setCorners([]);
      await areas.reload();
    } catch (err) {
      setError(err);
    }
  };

  // Start on an active area (Katsina city if there are none yet).
  const shown = areas.data?.find((a) => a.isActive) ?? areas.data?.[0];
  const first = shown?.boundary.coordinates[0]?.[0]?.[0];
  const center: Corner = first ? [first[1]!, first[0]!] : [12.99, 7.6];

  return (
    <>
      <div className="page-header">
        <h1>{t('areas.title')}</h1>
        {editable && !editing && (
          <button type="button" className="btn btn-primary" onClick={() => start(null)}>
            {t('areas.new')}
          </button>
        )}
      </div>
      {!editable && <p className="muted">{t('areas.readOnly')}</p>}
      {saved && <p className="notice notice-ok">{t('areas.saved')}</p>}
      <div className="areas-layout">
        <LeafletMap
          label={t('areas.title')}
          center={center}
          zoom={11}
          height={560}
          onReady={(map, L) => {
            mapRef.current = {
              map,
              L,
              areas: L.layerGroup().addTo(map),
              draft: L.layerGroup().addTo(map),
            };
            map.on('click', (e: Leaflet.LeafletMouseEvent) => {
              if (editingRef.current) setCorners((cs) => [...cs, [e.latlng.lat, e.latlng.lng]]);
            });
            void areas.reload();
          }}
        />
        <aside>
          {editing ? (
            <form onSubmit={(e) => void save(e)} className="card" data-testid="area-form">
              <p className="small">{t('areas.draw')}</p>
              <div className="field">
                <label htmlFor="area-key">{t('areas.key')}</label>
                <input
                  id="area-key"
                  value={editing.key}
                  disabled={!editing.isNew}
                  onChange={(e) => setEditing({ ...editing, key: e.target.value })}
                  pattern="[a-z][a-z0-9_\-]{1,40}"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="area-name">{t('areas.name')}</label>
                <input
                  id="area-name"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  required
                />
              </div>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={editing.isActive}
                  onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })}
                />
                {t('areas.active')}
              </label>
              <p className="small muted" data-testid="corner-count">
                {t('areas.corners', { count: corners.length })}
              </p>
              <div className="toolbar">
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  onClick={() => setCorners((c) => c.slice(0, -1))}
                >
                  {t('areas.undo')}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  onClick={() => setCorners([])}
                >
                  {t('areas.clear')}
                </button>
              </div>
              <InlineError error={error} />
              <div className="toolbar">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditing(null)}
                >
                  {t('common.cancel')}
                </button>
                <button className="btn btn-primary">{t('areas.save')}</button>
              </div>
            </form>
          ) : (
            <ul className="plain-list card">
              {(areas.data ?? []).map((a) => (
                <li key={a.id} className="row-between">
                  <span>
                    <strong>{a.name}</strong> <span className="small muted">{a.key}</span>
                    {!a.isActive && <span className="pill pill-muted">{t('areas.inactive')}</span>}
                  </span>
                  {editable && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      onClick={() => start(a)}
                    >
                      {t('areas.edit')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </>
  );
}
