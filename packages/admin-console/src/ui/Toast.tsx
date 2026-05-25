'use client';

import React, { createContext, useCallback, useContext, useState } from 'react';

// Nike toast — flat canvas card, rounded-none, ink-on-canvas with sale-red
// border for error tone.

type Tone = 'success' | 'error' | 'info';

interface ToastEntry {
  id: number;
  message: string;
  tone: Tone;
}

interface ToastApi {
  push: (message: string, tone?: Tone) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastEntry[]>([]);
  const push = useCallback<ToastApi['push']>((message, tone = 'info') => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setItems((prev) => prev.filter((it) => it.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm" aria-live="polite">
        {items.map((it) => (
          <div
            key={it.id}
            className={[
              'rounded-none border px-5 py-4 bg-canvas text-body-strong',
              it.tone === 'success' && 'border-success text-ink',
              it.tone === 'error' && 'border-sale text-sale',
              it.tone === 'info' && 'border-ink text-ink'
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {it.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (!ctx) return { push: () => {} };
  return ctx;
}
