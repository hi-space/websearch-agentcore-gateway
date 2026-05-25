'use client';

import React, { createContext, useCallback, useContext, useState } from 'react';

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
              'rounded-2xl border px-5 py-3.5 shadow-card bg-surface text-body-sm-medium',
              it.tone === 'success' && 'border-success/40 text-onBackground',
              it.tone === 'error' && 'border-error/40 text-error',
              it.tone === 'info' && 'border-outline text-onBackground'
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
