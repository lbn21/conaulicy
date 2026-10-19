"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";

type Theme = "dark" | "light" | "system";

const STORAGE_KEY = "theme";
const ORDER: Theme[] = ["dark", "light", "system"];
const LABEL: Record<Theme, string> = {
  dark: "Ciemny",
  light: "Jasny",
  system: "Systemowy",
};

const listeners = new Set<() => void>();

function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light" || stored === "system") {
      return stored;
    }
  } catch {}
  return "dark";
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

function setTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {}
  applyTheme(theme);
  for (const listener of listeners) listener();
}

function subscribeTheme(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    applyTheme(readTheme());
    onChange();
  };
  listeners.add(onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function ThemeIcon({ theme }: { theme: Theme }) {
  if (theme === "light") {
    return (
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20">
        <circle cx="10" cy="10" r="3.25" fill="currentColor" />
        <path
          d="M10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M3.9 3.9l1.4 1.4M14.7 14.7l1.4 1.4M16.1 3.9l-1.4 1.4M5.3 14.7l-1.4 1.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </svg>
    );
  }
  if (theme === "system") {
    return (
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20">
        <circle
          cx="10"
          cy="10"
          r="6.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path d="M10 3.5a6.5 6.5 0 0 0 0 13z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20">
      <path
        d="M14.2 12.4A5.6 5.6 0 0 1 7.6 5.8 5.6 5.6 0 1 0 14.2 12.4z"
        fill="currentColor"
      />
    </svg>
  );
}

export function ThemeSwitch() {
  const theme = useSyncExternalStore<Theme>(
    subscribeTheme,
    readTheme,
    () => "dark",
  );

  useLayoutEffect(() => {
    applyTheme(readTheme());
  }, []);

  const label = LABEL[theme];
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Wygląd strony: ${label}`}
      className="inline-flex min-h-12 min-w-12 shrink-0 items-center gap-2 rounded-sm px-3"
    >
      <ThemeIcon theme={theme} />
      <span aria-live="polite">{label}</span>
    </button>
  );
}
