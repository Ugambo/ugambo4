'use client';

import { useRouter } from 'next/navigation';
import { type ChangeEvent, useEffect, useState } from 'react';
import { BrandMark, useBrandLogo } from '@rideswithme/web-core/client';
import { InlineError } from '@/components/states';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';

/** The API keeps logos up to 75 KB; aim a little under. */
const MAX_BYTES = 70_000;
const MAX_SIDE = 512;

/**
 * Shrinks a picture to at most 512 x 512 in the browser and returns it as
 * base64: PNG when that is small enough (keeps transparency), otherwise WebP.
 */
async function prepareLogo(file: File): Promise<{ base64: string; preview: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('settings.logo.notImage'));
      i.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const [type, quality] of [
      ['image/png', undefined],
      ['image/webp', 0.92],
      ['image/webp', 0.8],
      ['image/jpeg', 0.85],
    ] as const) {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, quality));
      // A browser that cannot make WebP quietly makes PNG: check the type it gave.
      if (!blob || blob.type !== type || blob.size > MAX_BYTES) continue;
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(blob);
      });
      return { base64: dataUrl.slice(dataUrl.indexOf(',') + 1), preview: dataUrl };
    }
    throw new Error('settings.logo.tooBig');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Super admins: the logo shown on every website and inside the phone apps. */
export function LogoSettings() {
  const { t } = useI18n();
  const router = useRouter();
  const current = useBrandLogo();
  const [chosen, setChosen] = useState<{ base64: string; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<MessageKey | null>(null);
  const [fileError, setFileError] = useState<MessageKey | null>(null);

  // A new logo reaches this page through the layout once the page refreshes.
  useEffect(() => setChosen(null), [current]);

  const choose = async (e: ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setNotice(null);
    setFileError(null);
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setChosen(await prepareLogo(file));
    } catch (err) {
      setChosen(null);
      const key = (err as Error).message;
      setFileError(
        key === 'settings.logo.tooBig' ? 'settings.logo.tooBig' : 'settings.logo.notImage',
      );
    }
  };

  const run = async (fn: () => Promise<unknown>, done: MessageKey) => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await fn();
      setNotice(done);
      router.refresh();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card" data-testid="logo-settings">
      <h2>{t('settings.logo.title')}</h2>
      <p className="small muted">{t('settings.logo.intro')}</p>
      <div className="logo-row">
        <div className="logo-preview">
          {chosen ? (
            <img src={chosen.preview} alt={t('settings.logo.new')} width={72} height={72} />
          ) : (
            <BrandMark size={72} />
          )}
          <span className="small muted">
            {t(
              chosen
                ? 'settings.logo.new'
                : current
                  ? 'settings.logo.current'
                  : 'settings.logo.none',
            )}
          </span>
        </div>
        <div className="stack">
          <label className="btn btn-secondary" htmlFor="logo-file">
            {t('settings.logo.choose')}
          </label>
          <input
            id="logo-file"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="visually-hidden"
            onChange={(e) => void choose(e)}
          />
          {chosen && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() =>
                void run(() => api().admin.settings.setLogo(chosen.base64), 'settings.logo.saved')
              }
            >
              {t('settings.logo.save')}
            </button>
          )}
          {current && !chosen && (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => {
                if (window.confirm(t('settings.logo.removeConfirm')))
                  void run(() => api().admin.settings.removeLogo(), 'settings.logo.removed');
              }}
            >
              {t('settings.logo.remove')}
            </button>
          )}
        </div>
      </div>
      {notice && <p className="notice notice-ok">{t(notice)}</p>}
      {fileError && (
        <p className="inline-error" role="alert">
          {t(fileError)}
        </p>
      )}
      <InlineError error={error} />
    </section>
  );
}
