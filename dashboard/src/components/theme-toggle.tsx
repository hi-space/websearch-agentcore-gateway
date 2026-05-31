'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

type Theme = 'light' | 'dark';

function getInitialTheme(): Theme {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

/**
 * Toggles `.dark` on <html> and persists the choice. The pre-paint script in
 * layout.tsx applies the stored/system theme before render, so this just keeps
 * the button in sync and writes the user's explicit choice.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(getInitialTheme());
    setMounted(true);
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    const root = document.documentElement;
    root.classList.toggle('dark', next === 'dark');
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* private mode — ignore */
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle color theme"
      title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border bg-card/60 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {/* Avoid icon flash before we know the theme */}
      {mounted &&
        (theme === 'dark' ? (
          <Moon className="h-[18px] w-[18px]" />
        ) : (
          <Sun className="h-[18px] w-[18px]" />
        ))}
    </button>
  );
}
