"use client";

import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useState,
} from "react";

type Hit = { id: string; label: string };
type Status = "idle" | "loading" | "done" | "error";

function addresses(n: number): string {
  if (n === 1) return "1 adres";
  const tens = n % 100;
  const ones = n % 10;
  if (ones >= 2 && ones <= 4 && (tens < 12 || tens > 14)) return `${n} adresy`;
  return `${n} adresów`;
}

export function AddressSearch() {
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listId = `${baseId}-list`;
  const hintId = `${baseId}-hint`;

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setHits([]);
      setStatus("idle");
      setActive(-1);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus("loading");
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: Hit[] = await res.json();
        setHits(data);
        setActive(-1);
        setStatus("done");
      } catch {
        if (controller.signal.aborted) return;
        setHits([]);
        setStatus("error");
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const expanded = open && hits.length > 0;

  function go(hit: Hit) {
    setOpen(false);
    window.location.assign(`/adres/${encodeURIComponent(hit.id)}`);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
        if (hits.length === 0) return;
        event.preventDefault();
        setOpen(true);
        setActive((i) => (i + 1) % hits.length);
        break;
      case "ArrowUp":
        if (hits.length === 0) return;
        event.preventDefault();
        setOpen(true);
        setActive((i) => (i <= 0 ? hits.length - 1 : i - 1));
        break;
      case "Home":
        if (hits.length === 0) return;
        event.preventDefault();
        setOpen(true);
        setActive(0);
        break;
      case "End":
        if (hits.length === 0) return;
        event.preventDefault();
        setOpen(true);
        setActive(hits.length - 1);
        break;
      case "Escape":
        event.preventDefault();
        if (expanded) {
          setOpen(false);
          setActive(-1);
        } else {
          setQuery("");
        }
        break;
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const hit = hits[active] ?? (hits.length === 1 ? hits[0] : undefined);
    if (hit) go(hit);
    else setOpen(true);
  }

  let message = "";
  if (status === "loading") {
    message = "Szukam…";
  } else if (status === "error") {
    message = "Coś nie zadziałało po naszej stronie. Spróbuj za chwilę.";
  } else if (status === "done" && hits.length === 0) {
    message =
      "Nie mamy jeszcze tej ulicy ani wsi. Na razie znamy tylko kilka adresów – są niżej.";
  } else if (status === "done" && expanded) {
    message = `${addresses(hits.length)}. Wybierz strzałkami i Enterem albo dotknij.`;
  }

  return (
    <search>
      <form onSubmit={onSubmit} className="flex flex-col gap-2">
        <label htmlFor={inputId} className="text-lg font-bold">
          Twoja ulica albo wieś
        </label>
        <p id={hintId} className="text-text-muted">
          Ulica w Lubaczowie albo wieś, np. Lisie Jamy. Polskie znaki nie są
          potrzebne.
        </p>
        <div className="relative mt-1">
          <svg
            aria-hidden="true"
            width="22"
            height="22"
            viewBox="0 0 22 22"
            className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-text-muted"
          >
            <circle
              cx="9.5"
              cy="9.5"
              r="5.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M14 14.5 19 19.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <input
            id={inputId}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={expanded}
            aria-controls={listId}
            aria-activedescendant={
              expanded && active >= 0 ? `${listId}-${active}` : undefined
            }
            aria-describedby={hintId}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="go"
            placeholder="np. Słowackiego"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={onKeyDown}
            className="min-h-14 w-full rounded-sm border-2 border-border bg-surface pr-4 pl-12 text-lg text-text placeholder:text-text-muted focus-visible:border-focus"
          />
        </div>
        <div
          id={listId}
          role="listbox"
          aria-label="Pasujące adresy"
          hidden={!expanded}
          className="rounded-sm border-2 border-border bg-surface py-1"
        >
          {hits.map((hit, i) => (
            // biome-ignore lint/a11y/useKeyWithClickEvents: the combobox input owns keyboard selection
            <div
              key={hit.id}
              id={`${listId}-${i}`}
              role="option"
              tabIndex={-1}
              aria-selected={i === active}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(hit)}
              className="flex min-h-12 cursor-pointer items-center px-4 py-2 aria-selected:bg-surface-2 aria-selected:shadow-[inset_4px_0_0_var(--accent)]"
            >
              {hit.label}
            </div>
          ))}
        </div>
        <p role="status" className="min-h-[1.55em] text-text-muted">
          {message}
        </p>
      </form>
    </search>
  );
}
