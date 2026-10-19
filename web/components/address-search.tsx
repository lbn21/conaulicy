"use client";

import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
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
  const [hitsFor, setHitsFor] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

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
        setHitsFor(q);
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

  // The popup floats over the page (absolute), so nothing below the field
  // moves when it opens, updates or closes.
  const popup =
    open && query.trim() !== "" && (hits.length > 0 || status !== "idle");
  const expanded = popup && hits.length > 0;

  // Keep the active option visible when the list scrolls.
  useEffect(() => {
    if (!expanded || active < 0) return;
    document
      .getElementById(`${listId}-${active}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [expanded, active, listId]);

  // On a phone, move the field near the top so the list has room below it
  // (and above the keyboard). Scrolling only; the layout stays the same.
  function makeRoom() {
    const input = inputRef.current;
    if (!input || !window.matchMedia("(max-width: 47.99rem)").matches) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    input.scrollIntoView({
      block: "start",
      behavior: still ? "auto" : "smooth",
    });
  }

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
        if (popup) {
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
    const fresh = hitsFor === query.trim();
    const hit =
      hits[active] ?? (fresh && hits.length === 1 ? hits[0] : undefined);
    if (hit) go(hit);
    else setOpen(true);
  }

  // Shown in the popup when there are no options to list.
  let note = "";
  if (status === "loading") {
    note = "Szukam…";
  } else if (status === "error") {
    note = "Błąd: coś nie zadziałało po naszej stronie. Spróbuj za chwilę.";
  } else if (status === "done" && hits.length === 0) {
    note =
      "Brak wyników. Nie mamy jeszcze tej ulicy ani wsi – sprawdź przykładowe adresy poniżej.";
  }

  // For screen readers only, in a live region that takes no space.
  let message = hits.length === 0 ? note : "";
  if (status === "done" && expanded) {
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
              setActive(-1);
              setOpen(true);
            }}
            ref={inputRef}
            onFocus={() => {
              setOpen(true);
              makeRoom();
            }}
            onBlur={() => setOpen(false)}
            onKeyDown={onKeyDown}
            className="min-h-14 w-full scroll-mt-4 rounded-sm border-2 border-border bg-surface pr-4 pl-12 text-lg text-text placeholder:text-text-muted focus-visible:border-focus"
          />
          <div
            hidden={!popup}
            className="absolute inset-x-0 top-full z-20 mt-1 rounded-sm border-2 border-border bg-surface shadow-[var(--elevation)]"
          >
            <div
              id={listId}
              role="listbox"
              aria-label="Pasujące adresy"
              hidden={hits.length === 0}
              className="max-h-[24.5rem] overflow-y-auto overscroll-contain py-1"
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
                  // Move, not enter: the focus scroll slides options under a resting
                  // pointer, which must not pick one.
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(hit)}
                  className="flex min-h-12 cursor-pointer items-center px-4 py-2 aria-selected:bg-surface-2 aria-selected:shadow-[inset_4px_0_0_var(--accent)]"
                >
                  {hit.label}
                </div>
              ))}
            </div>
            {hits.length === 0 && note && (
              // Announced by the live region below; hidden here to avoid twice.
              <p
                aria-hidden="true"
                className={
                  status === "error"
                    ? "px-4 py-3 font-bold text-danger"
                    : "px-4 py-3 text-text-muted"
                }
              >
                {note}
              </p>
            )}
          </div>
        </div>
        <p role="status" className="sr-only">
          {message}
        </p>
      </form>
    </search>
  );
}
