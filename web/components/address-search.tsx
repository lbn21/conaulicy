"use client";

import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { withHouseNumber } from "@/lib/house";
import {
  findPlaces,
  type Matcher,
  matcher,
  placeHref,
  SEARCH_ID,
  type SearchHit,
  type SearchIndex,
  searchTerms,
} from "@/lib/search";

type Status = "idle" | "hint" | "loading" | "done" | "error";
type Remote = { for: string; hits: SearchHit[]; failed: boolean };

function addresses(n: number): string {
  if (n === 1) return "1 adres";
  const tens = n % 100;
  const ones = n % 10;
  if (ones >= 2 && ones <= 4 && (tens < 12 || tens > 14)) return `${n} adresy`;
  return `${n} adresów`;
}

// One download per page, shared by every field on it.
const indexes = new Map<string, Promise<Matcher>>();

function loadIndex(url: string): Promise<Matcher> {
  let index = indexes.get(url);
  if (!index) {
    index = fetch(url).then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return matcher((await res.json()) as SearchIndex);
    });
    indexes.set(url, index);
  }
  return index;
}

/**
 * The address search. The index of every place (indexUrl) loads on first
 * focus or input, not with the page; then each keystroke is matched on the
 * device. If the index cannot load, each settled query goes to /api/search.
 */
export function AddressSearch({ indexUrl }: { indexUrl: string }) {
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listId = `${baseId}-list`;
  const hintId = `${baseId}-hint`;

  const [query, setQuery] = useState("");
  const [match, setMatch] = useState<Matcher | null>(null);
  const [indexFailed, setIndexFailed] = useState(false);
  const [remote, setRemote] = useState<Remote | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  // "Zmień adres" on a street page links to /#szukaj: an empty field, ready
  // to type in, with the list closed. Without JS the link still lands here.
  useEffect(() => {
    if (window.location.hash === `#${SEARCH_ID}`) inputRef.current?.focus();
  }, []);

  function startLoading() {
    if (match || indexFailed) return;
    loadIndex(indexUrl).then(
      (m) => setMatch(() => m),
      () => setIndexFailed(true),
    );
  }

  const q = query.trim();
  const terms = searchTerms(q);
  // Fallback key: the query with the words that matter (and any number).
  const remoteKey = terms.length > 0 ? q.replace(/\s+/g, " ") : "";

  // Fallback only: without the index, ask the server once typing settles.
  useEffect(() => {
    if (!indexFailed || !remoteKey) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(remoteKey)}`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setRemote({ for: remoteKey, hits: await res.json(), failed: false });
      } catch {
        if (controller.signal.aborted) return;
        setRemote({ for: remoteKey, hits: [], failed: true });
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [indexFailed, remoteKey]);

  let hits: SearchHit[] = [];
  let status: Status;
  if (!q) {
    status = "idle";
  } else if (terms.length === 0) {
    status = "hint";
  } else if (match) {
    hits = findPlaces(match, q);
    status = "done";
  } else if (indexFailed && remote?.for === remoteKey) {
    hits = remote.hits;
    status = remote.failed ? "error" : "done";
  } else {
    status = "loading";
  }

  // The popup floats over the page (absolute), so nothing below the field
  // moves when it opens, updates or closes.
  const popup = open && status !== "idle";
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

  function go(hit: SearchHit) {
    setOpen(false);
    window.location.assign(placeHref(hit));
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
    const hit = hits[active] ?? (hits.length === 1 ? hits[0] : undefined);
    if (hit) go(hit);
    else setOpen(true);
  }

  // Shown in the popup when there are no options to list.
  let note = "";
  if (status === "hint") {
    note = "Wpisz nazwę ulicy.";
  } else if (status === "loading") {
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
    <search id={SEARCH_ID} className="app-search">
      <form onSubmit={onSubmit}>
        <div className="govuk-form-group">
          <label htmlFor={inputId} className="govuk-label govuk-label--m">
            Twoja ulica albo wieś
          </label>
          <div id={hintId} className="govuk-hint">
            Ulica w Lubaczowie albo wieś, np. Lisie Jamy. Numer domu możesz
            dopisać: Asnyka 12. Polskie znaki nie są potrzebne.
          </div>
          <div className="app-suggestions">
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
              value={query}
              onChange={(event) => {
                startLoading();
                setQuery(event.target.value);
                setActive(-1);
                setOpen(true);
              }}
              ref={inputRef}
              onFocus={() => {
                startLoading();
                setOpen(true);
                makeRoom();
              }}
              onBlur={() => setOpen(false)}
              onKeyDown={onKeyDown}
              className="govuk-input"
            />
            <div hidden={!popup} className="app-suggestions__popup">
              <div
                id={listId}
                role="listbox"
                aria-label="Pasujące adresy"
                hidden={hits.length === 0}
                className="app-suggestions__list"
              >
                {hits.map((hit, i) => (
                  // Keyed by position: when a keystroke narrows the list, rows
                  // keep their place and change text, so nothing slides.
                  // biome-ignore lint/a11y/useKeyWithClickEvents: the combobox input owns keyboard selection
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: see above
                    key={i}
                    id={`${listId}-${i}`}
                    role="option"
                    tabIndex={-1}
                    aria-selected={i === active}
                    onMouseDown={(event) => event.preventDefault()}
                    // Move, not enter: the focus scroll slides options under a
                    // resting pointer, which must not pick one.
                    onMouseMove={() => setActive(i)}
                    onClick={() => go(hit)}
                    className="app-suggestions__option"
                  >
                    {withHouseNumber(hit.label, hit.nr ?? null)}
                  </div>
                ))}
              </div>
              {hits.length === 0 && note && (
                // Announced by the live region below; hidden here to avoid twice.
                <p
                  aria-hidden="true"
                  className={
                    status === "error"
                      ? "app-suggestions__note app-suggestions__note--error"
                      : status === "hint"
                        ? "app-suggestions__note"
                        : "app-suggestions__note app-suggestions__note--muted"
                  }
                >
                  {note}
                </p>
              )}
            </div>
          </div>
        </div>
        <p role="status" className="govuk-visually-hidden">
          {message}
        </p>
      </form>
    </search>
  );
}
