'use client';

import React, { useEffect } from 'react';

// Nike modal — flat canvas card, rounded-none, hairline divider on footer.

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
      <div className="absolute inset-0 bg-ink/60" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className="relative z-10 w-full max-w-lg bg-canvas rounded-none shadow-modal border border-hairline overflow-hidden"
      >
        <div className="flex items-start justify-between px-8 pt-8 pb-2">
          <h2 className="text-heading-lg text-ink">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-ink hover:bg-surfaceSoft rounded-full w-10 h-10 inline-flex items-center justify-center -mr-2"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="m4 4 8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="px-8 pb-8 pt-2 text-body-md text-charcoal leading-relaxed">{children}</div>
        {footer && <div className="px-8 py-5 border-t border-hairline flex justify-end gap-3">{footer}</div>}
      </div>
    </div>
  );
}
