"use client";

import type { LucideIcon } from "lucide-react";
import { Moon, Sun, SunMoon } from "lucide-react";
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

const ICON: Record<Theme, LucideIcon> = {
  dark: Moon,
  light: Sun,
  system: SunMoon,
};

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
  const Icon = ICON[theme];
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Wygląd strony: ${label}`}
      className="inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center gap-2 rounded-sm sm:px-3"
    >
      <Icon aria-hidden="true" size={24} />
      {/* Matches the accessible name, so voice control users can say what they see.
          All labels share one grid cell, so the button keeps the widest one's
          width when the stored theme replaces the server's "Ciemny". */}
      <span aria-hidden="true" className="hidden sm:inline-grid">
        {ORDER.map((option) => (
          <span
            key={option}
            className={`col-start-1 row-start-1 ${option === theme ? "" : "invisible"}`}
          >
            Wygląd strony: {LABEL[option]}
          </span>
        ))}
      </span>
      <span aria-live="polite" className="sr-only">
        {label}
      </span>
    </button>
  );
}
