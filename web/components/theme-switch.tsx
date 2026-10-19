"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";

type Theme = "dark" | "light" | "system";

const STORAGE_KEY = "theme";
const LIGHT_QUERY = "(prefers-color-scheme: light)";

const OPTIONS: Array<{ value: Theme; label: string }> = [
  { value: "dark", label: "Ciemny" },
  { value: "light", label: "Jasny" },
  { value: "system", label: "Systemowy" },
];

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

function subscribeSystem(onChange: () => void) {
  const query = window.matchMedia(LIGHT_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function ThemeSwitch() {
  const theme = useSyncExternalStore<Theme>(
    subscribeTheme,
    readTheme,
    () => "dark",
  );
  const systemLight = useSyncExternalStore(
    subscribeSystem,
    () => window.matchMedia(LIGHT_QUERY).matches,
    () => false,
  );

  // React resets <html> attributes on the dev Strict Mode remount.
  useLayoutEffect(() => {
    applyTheme(readTheme());
  }, []);

  return (
    <fieldset>
      <legend className="mb-2 font-bold">Wygląd strony</legend>
      <div className="flex max-w-md flex-wrap gap-1 rounded-sm border border-border p-1">
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className="segment flex min-h-12 grow cursor-pointer items-center justify-center rounded-sm px-3 transition-colors has-[:checked]:bg-surface-2 has-[:checked]:font-bold has-[:checked]:shadow-[inset_0_-3px_0_var(--accent)]"
          >
            <input
              type="radio"
              name="theme"
              value={option.value}
              checked={theme === option.value}
              onChange={() => setTheme(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
      <p aria-live="polite" className="mt-2 min-h-[1.55em] text-text-muted">
        {theme === "system"
          ? `Teraz ${systemLight ? "jasny" : "ciemny"}, tak jak w ustawieniach urządzenia.`
          : ""}
      </p>
    </fieldset>
  );
}
