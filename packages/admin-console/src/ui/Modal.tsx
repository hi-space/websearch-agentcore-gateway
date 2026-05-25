'use client';

import React, { useEffect } from 'react';

export function Modal({
  open,
  onClose,
  title,
  children,
  footer
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-inkDeep/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className="relative z-10 w-full max-w-lg bg-surface rounded-2xl shadow-modal border border-outline overflow-hidden"
      >
        <div className="flex items-start justify-between px-7 pt-7 pb-2">
          <h2 className="text-card-title text-onBackground">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-stone hover:text-onBackground rounded-full p-1.5 -m-1.5 hover:bg-background"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="m4 4 8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="px-7 pb-7 pt-2 text-body-md text-slate leading-relaxed">{children}</div>
        {footer && <div className="px-7 py-4 bg-background border-t border-outline flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
