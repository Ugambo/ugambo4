'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { LatLng, Place, PlaceSuggestion } from '@rideswithme/shared-types';
import { api } from '@/lib/api';
import { InlineError, useI18n } from '@/lib/i18n';

/**
 * A place picker: shows the chosen place, or a search box with suggestions
 * from the API (the maps provider stays on the server). Pickup can also use
 * the browser's location.
 */
export function PlaceField({
  label,
  placeholder,
  value,
  onChange,
  near,
  allowCurrentLocation = false,
  autoFocus = false,
  testId,
}: {
  label: string;
  placeholder: string;
  value: Place | null;
  onChange: (place: Place | null) => void;
  near?: LatLng | undefined;
  allowCurrentLocation?: boolean;
  autoFocus?: boolean;
  testId: string;
}) {
  const { t } = useI18n();
  const id = useId();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [locating, setLocating] = useState(false);
  const [locationFailed, setLocationFailed] = useState(false);
  // One session token per search, so the maps provider bills it as one session.
  const sessionToken = useRef(crypto.randomUUID());
  const latest = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions(null);
      return;
    }
    const mine = ++latest.current;
    const timer = setTimeout(() => {
      api()
        .places.autocomplete(q, near, sessionToken.current)
        .then(
          (s) => mine === latest.current && (setSuggestions(s), setError(null)),
          (err: unknown) => mine === latest.current && setError(err),
        );
    }, 250);
    return () => clearTimeout(timer);
  }, [query, near?.lat, near?.lng]);

  const pick = async (s: PlaceSuggestion) => {
    try {
      const place = await api().places.details(s.placeId, sessionToken.current);
      sessionToken.current = crypto.randomUUID();
      setQuery('');
      setSuggestions(null);
      onChange(place);
    } catch (err) {
      setError(err);
    }
  };

  const useMyLocation = () => {
    setLocating(true);
    setLocationFailed(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        api()
          .places.reverse({ lat: pos.coords.latitude, lng: pos.coords.longitude })
          .then(onChange, setError)
          .finally(() => setLocating(false));
      },
      () => {
        setLocating(false);
        setLocationFailed(true);
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  };

  if (value) {
    return (
      <div className="place-chosen" data-testid={testId}>
        <span className="place-label">{label}</span>
        <span className="place-text">
          <strong>{value.name ?? value.address}</strong>
          {value.name && <span className="small muted">{value.address}</span>}
        </span>
        <button type="button" className="btn btn-ghost btn-small" onClick={() => onChange(null)}>
          {t('book.change')}
        </button>
      </div>
    );
  }

  return (
    <div className="field place-field" data-testid={testId}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="search"
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={query}
        role="combobox"
        aria-expanded={!!suggestions?.length}
        aria-controls={`${id}-list`}
        onChange={(e) => setQuery(e.target.value)}
      />
      {allowCurrentLocation && (
        <button
          type="button"
          className="btn btn-ghost btn-small"
          onClick={useMyLocation}
          disabled={locating}
        >
          ◎ {locating ? t('book.locating') : t('book.useLocation')}
        </button>
      )}
      {locationFailed && <p className="small muted">{t('book.locationFailed')}</p>}
      <InlineError error={error} />
      {query.trim().length > 0 && query.trim().length < 2 && (
        <p className="small muted">{t('search.typeMore')}</p>
      )}
      {suggestions && (
        <ul className="suggestions" id={`${id}-list`} role="listbox">
          {suggestions.length === 0 && <li className="muted small">{t('search.noResults')}</li>}
          {suggestions.map((s) => (
            <li key={s.placeId} role="option" aria-selected={false}>
              <button type="button" onClick={() => void pick(s)}>
                <strong>{s.primaryText}</strong>
                <span className="small muted">{s.secondaryText}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
