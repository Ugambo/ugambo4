'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import { useI18n } from '@/lib/i18n';

/** Accessible modal on the native <dialog> element (focus trap and Escape built in). */
export function Modal({
  title,
  open,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useI18n();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={wide ? 'modal modal-wide' : 'modal'}
      onClose={onClose}
      aria-labelledby="modal-title"
    >
      <header className="modal-header">
        <h2 id="modal-title">{title}</h2>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onClose}
          aria-label={t('common.close')}
        >
          ✕
        </button>
      </header>
      {open && children}
    </dialog>
  );
}
