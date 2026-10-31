"use client";

import "accessible-autocomplete/dist/accessible-autocomplete.min.css";
import Autocomplete from "accessible-autocomplete/react";
import Form from "next/form";
import { useRouter } from "next/navigation";
import {
  createContext,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  use,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ErrorSummary } from "@/components/error-summary";
import { withHouseNumber } from "@/lib/house";
import { whenIdle } from "@/lib/idle";
import {
  addresses,
  type Matcher,
  SEARCH_ID,
  type SearchHit,
  searchTerms,
} from "@/lib/search";
import { HINT, LABEL } from "@/lib/search-hint";
import { loadedIndex, loadIndex } from "@/lib/search-index";
import { placeTarget, searchHref, searchQuery } from "@/lib/search-submit";

// One search per page (the home page or /szukaj), so fixed ids.
const INPUT_ID = "adres";
const LABEL_ID = "adres-label";
const HINT_ID = "adres-hint";
const ERROR_ID = "adres-error";

const EMPTY_ERROR = "Wpisz nazwę ulicy albo wsi";

type Note = "hint" | "loading" | "error" | "none";

const NOTES: Record<Note, string> = {
  hint: "Wpisz nazwę ulicy.",
  loading: "Szukam…",
  error: "Błąd: coś nie zadziałało po naszej stronie. Spróbuj za chwilę.",
  none: "Brak wyników. Nie mamy jeszcze tej ulicy ani wsi – sprawdź przykładowe adresy poniżej.",
};

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// What accessible-autocomplete hands to the templates: our
// results, or a plain string (its options may be strings, e.g. it seeds
// them with defaultValue, which this field does not use).
type Option = SearchHit | string | undefined;

function optionText(option: Option): string {
  if (!option) return "";
  if (typeof option === "string") return option;
  return withHouseNumber(option.label, option.nr ?? null);
}

// Save-Data (Chromium's navigator.connection, not in TypeScript's DOM types).
function saveData(): boolean {
  const { connection } = navigator as { connection?: { saveData?: boolean } };
  return connection?.saveData === true;
}

// Runs `callback` once the page has loaded and is idle; returns what
// cancels it.
function afterLoad(callback: () => void): () => void {
  if (document.readyState === "complete") return whenIdle(callback, 2000, 200);
  let cancelIdle = () => {};
  const onLoad = () => {
    cancelIdle = whenIdle(callback, 2000, 200);
  };
  window.addEventListener("load", onLoad, { once: true });
  return () => {
    window.removeEventListener("load", onLoad);
    cancelIdle();
  };
}

// Escape closes the list through the library's own state, so aria-expanded
// follows (its blur keeps the list open on iOS).
function closeList(container: HTMLElement | null) {
  container?.querySelector(`#${INPUT_ID}`)?.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      keyCode: 27,
      bubbles: true,
    }),
  );
}

/**
 * The suggestions' source: each query matched on the device, over the index
 * (lib/search-index.ts, shared with „Szukaj” and /szukaj's results), loaded
 * once by `load`; if it cannot load, settled queries go to /api/search.
 * `note` is what the list says when it has no suggestion.
 */
function suggestions(indexUrl: string) {
  let note: Note = "none";
  let latest = "";
  let match: Matcher | null = null;
  let failed = false;
  let started: Promise<void> | null = null;
  const load = () => {
    started ??= loadIndex(indexUrl).then(
      (index) => {
        match = index.match;
      },
      () => {
        failed = true;
      },
    );
    return started;
  };

  async function remote(q: string): Promise<SearchHit[] | null> {
    // Without the index, ask the server once typing settles.
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (q !== latest) return null;
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as SearchHit[];
  }

  async function source(query: string, populate: (options: Option[]) => void) {
    const q = query.trim().replace(/\s+/g, " ");
    latest = q;
    if (q && searchTerms(q).length === 0) {
      note = "hint";
      populate([]);
      return;
    }
    if (!q) return populate([]);
    if (!match && !failed) {
      note = "loading";
      populate([]);
      await load();
      if (q !== latest) return;
    }
    if (match) {
      note = "none";
      populate(match(q).hits);
      return;
    }
    try {
      const hits = await remote(q);
      if (hits === null || q !== latest) return;
      note = "none";
      populate(hits);
    } catch {
      if (q !== latest) return;
      note = "error";
      populate([]);
    }
  }

  return { load, source, note: () => NOTES[note] };
}

// An empty search, as GOV.UK validates a form: the error summary at the top
// of the page's column (SearchErrorSummary) and the error on the field, on
// the page where it was submitted. `count` is how many times, so a repeat
// draws a new summary, which takes focus again.
const SearchError = createContext<{ count: number; report: () => void }>({
  count: 0,
  report: () => {},
});

/** Holds the search's error state for the page's column. */
export function SearchErrorProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  const value = useMemo(
    () => ({ count, report: () => setCount((n) => n + 1) }),
    [count],
  );
  return <SearchError value={value}>{children}</SearchError>;
}

/**
 * GOV.UK's error summary for an empty search, at the top of the column;
 * nothing until one. Started with GOV.UK Frontend's own ErrorSummary, which
 * focuses it, so it is announced.
 */
export function SearchErrorSummary() {
  const { count } = use(SearchError);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!count || !ref.current) return;
    const scope = ref.current;
    void import("@/lib/govuk-frontend").then((m) => m.initGovukFrontend(scope));
  }, [count]);
  if (!count) return null;
  return (
    <div ref={ref} key={count}>
      <ErrorSummary error={EMPTY_ERROR} href={`#${INPUT_ID}`} />
    </div>
  );
}

/**
 * The address search: alphagov accessible-autocomplete, unmodified, its
 * React build (README, "Using with React") set up through its documented
 * options only, rendered on the server with the page, so the field a user
 * taps is its own from the first paint (iOS opens the keyboard only for
 * focus given in the tap itself), and hydrated in place. The index of every
 * place loads once, in the background once the page has loaded and is
 * idle, or on first focus if that comes first (only then with Save-Data
 * on), so suggestions are ready from the first letter; then each keystroke
 * is matched on the device ("Asnyka 5" carries the house number to ?nr=).
 * The list opens inline, under the field and above „Szukaj”, pushing what
 * follows down while it is open (GOV.UK's default), so it never covers the
 * button. As GOV.UK's default (no onConfirm, no autoselect), nothing is
 * highlighted until ArrowDown, which goes to the first suggestion. Choosing
 * a suggestion (a tap or click, or Enter with it highlighted) only fills the
 * field with its text and closes the list (Jakub's decision, 31 Oct 2026);
 * with none highlighted (list open or closed, none found, still loading)
 * Enter submits what was typed. The library alone would do nothing on Enter
 * with the list open and nothing highlighted, so submitOnEnter does that.
 * confirmOnBlur stays off: leaving the field keeps what was typed.
 *
 * „Szukaj” (Next.js's <Form>: a client-side navigation to /szukaj, whose
 * shell it prefetches) decides on the device, over the same index, waiting
 * for it if it is not in yet: one place (a picked suggestion, or one clearly
 * best) opens its page straight away; anything else is /szukaj's list,
 * drawn at once from the index in memory. An empty field is GOV.UK's error,
 * on the page where it was submitted. The home page and /szukaj both render
 * the field, empty.
 */
export function AddressSearch({ indexUrl }: { indexUrl: string }) {
  const router = useRouter();
  const { count, report } = use(SearchError);
  const error = count > 0 ? EMPTY_ERROR : null;
  const [search] = useState(() => suggestions(indexUrl));
  const containerRef = useRef<HTMLDivElement>(null);
  const waiting = useRef(false);

  // The index once the page is idle (not with Save-Data on), or at the
  // field's first focus if that comes sooner. The first to come loads it,
  // once.
  useEffect(() => {
    const container = containerRef.current;
    const load = () => void search.load();
    container?.addEventListener("focusin", load, { once: true });
    const cancelPrefetch = saveData() ? () => {} : afterLoad(load);
    return () => {
      container?.removeEventListener("focusin", load);
      cancelPrefetch();
    };
  }, [search]);

  // Back to a page kept in the back/forward cache: the list is as it was
  // left, open.
  useEffect(() => {
    function closeOnRestore(event: PageTransitionEvent) {
      if (event.persisted) closeList(containerRef.current);
    }
    window.addEventListener("pageshow", closeOnRestore);
    return () => window.removeEventListener("pageshow", closeOnRestore);
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    const field = event.currentTarget.elements.namedItem("q");
    const q = searchQuery(field instanceof HTMLInputElement ? field.value : "");
    if (!q) {
      event.preventDefault();
      report();
      return;
    }
    // Next.js keeps the page, hidden, for Back: with the list closed.
    closeList(containerRef.current);
    const index = loadedIndex(indexUrl);
    if (index) {
      const place = placeTarget(index, q);
      // One place: its page. Otherwise <Form> goes to /szukaj?q=.
      if (place) {
        event.preventDefault();
        router.push(place);
      }
      return;
    }
    // The index is not in yet: decide once it is (or, if it cannot load,
    // let /szukaj ask the server). One press at a time.
    event.preventDefault();
    if (waiting.current) return;
    waiting.current = true;
    loadIndex(indexUrl)
      .then(
        (loaded) => placeTarget(loaded, q),
        () => null,
      )
      .then((place) => {
        waiting.current = false;
        router.push(place ?? searchHref(q));
      });
  }

  // Enter with the list open and no suggestion highlighted: the library
  // stops the submit and does nothing, so submit what was typed. With one
  // highlighted, focus is on that option (not the field) and the library
  // fills the field with it.
  function submitOnEnter(event: ReactKeyboardEvent<HTMLFormElement>) {
    if (
      event.key === "Enter" &&
      event.nativeEvent.defaultPrevented &&
      event.target instanceof HTMLInputElement &&
      event.target.id === INPUT_ID
    ) {
      event.currentTarget.requestSubmit();
    }
  }

  // A press on „Szukaj” with the field focused: the field keeps focus until
  // the click, or its blur would close the list above the button, move the
  // button up from under the pointer, and lose the click.
  function keepFocus(event: ReactMouseEvent<HTMLButtonElement>) {
    if (document.activeElement?.id === INPUT_ID) event.preventDefault();
  }

  return (
    <search id={SEARCH_ID} className="app-search">
      <Form action="/szukaj" onSubmit={submit} onKeyDown={submitOnEnter}>
        <div
          className={
            error
              ? "govuk-form-group govuk-form-group--error"
              : "govuk-form-group"
          }
        >
          <label
            id={LABEL_ID}
            htmlFor={INPUT_ID}
            className="govuk-label govuk-label--m"
          >
            {LABEL}
          </label>
          <div id={HINT_ID} className="govuk-hint">
            {HINT}
          </div>
          {error && (
            <p id={ERROR_ID} className="govuk-error-message">
              <span className="govuk-visually-hidden">Błąd:</span> {error}
            </p>
          )}
          <div ref={containerRef}>
            <Autocomplete<Option>
              id={INPUT_ID}
              source={search.source}
              name="q"
              inputClasses={
                error ? "govuk-input govuk-input--error" : "govuk-input"
              }
              menuAttributes={{ "aria-labelledby": LABEL_ID }}
              confirmOnBlur={false}
              templates={{
                inputValue: optionText,
                suggestion: (option: Option) => escapeHtml(optionText(option)),
              }}
              tNoResults={search.note}
              tStatusNoResults={search.note}
              tStatusSelectedOption={(option, length, i) =>
                `${option}, ${i + 1} z ${length}, zaznaczony`
              }
              tStatusResults={(length, selected) =>
                `${addresses(length)} do wyboru. ${selected}`
              }
              // 3.0.2 sets the field's aria-describedby itself (to this text
              // only, and only until something is typed) and cannot add ids
              // to it, so adres-hint and adres-error are not on the field:
              // the error, then the hint, are read from here instead.
              tAssistiveHint={() =>
                `${error ? `Błąd: ${error}. ` : ""}${HINT} Gdy pojawią się podpowiedzi, wybierz je strzałkami w górę i w dół i Enterem albo dotknij.`
              }
            />
          </div>
        </div>
        <button
          type="submit"
          className="govuk-button"
          data-module="govuk-button"
          onMouseDown={keepFocus}
        >
          Szukaj
        </button>
      </Form>
    </search>
  );
}
