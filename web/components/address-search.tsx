"use client";

import "accessible-autocomplete/dist/accessible-autocomplete.min.css";
import { useEffect, useRef } from "react";
import { withHouseNumber } from "@/lib/house";
import { whenIdle } from "@/lib/idle";
import {
  addresses,
  type Matcher,
  matcher,
  SEARCH_ID,
  type SearchHit,
  type SearchIndex,
  searchTerms,
} from "@/lib/search";

// One search per page (the home page or /szukaj), so fixed ids.
const INPUT_ID = "adres";
const LABEL_ID = "adres-label";
const HINT_ID = "adres-hint";
const ERROR_ID = "adres-error";

const HINT =
  "Na przykład Asnyka 12 albo Lisie Jamy – polskie znaki nie są potrzebne";

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

// The same field accessible-autocomplete renders (its classes, GOV.UK's
// govuk-input), so nothing moves when it takes over after load. Named q, as
// the library's field, so the form works before and without it.
function placeholder(
  value: string,
  inputClasses: string,
  error: boolean,
): string {
  const describedBy = error ? `${HINT_ID} ${ERROR_ID}` : HINT_ID;
  return `<div class="autocomplete__wrapper"><input id="${INPUT_ID}" name="q" type="text" value="${escapeHtml(value)}" class="autocomplete__input autocomplete__input--default ${inputClasses}" autocomplete="off" aria-describedby="${describedBy}"></div>`;
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

/**
 * The address search: a plain GET form to /szukaj, which works without JS,
 * enhanced with alphagov accessible-autocomplete, unmodified, set up through
 * its documented options only. It loads once the page is idle, so the field
 * a user taps is already its own: iOS opens the keyboard only for focus given
 * in the tap itself, never for focus moved to a new field after an async
 * import. The index of every place loads once, in the background once the
 * page has loaded and is idle, or on first focus if that comes first (only
 * then with Save-Data on), so suggestions are ready from the first letter;
 * then each keystroke is matched on the device
 * ("Asnyka 12" carries the house number to ?nr=). If the index cannot load,
 * settled queries go to /api/search. As GOV.UK's default (no onConfirm),
 * choosing a suggestion (tap, click, or arrows and Enter) only fills the
 * field with its text and closes the list; „Szukaj”, or Enter with the list
 * closed, submits the form, and /szukaj opens the place whose text it is.
 * With autoselect the first suggestion is highlighted, so Enter with the
 * list open picks it and the next Enter submits; with none (none found,
 * still loading) Enter submits at once. confirmOnBlur stays off: leaving the
 * field keeps what was typed rather than the highlighted suggestion.
 *
 * The one search field: the home page and /szukaj both render it. On
 * /szukaj it holds the text searched for (`value`) and, for an empty search,
 * GOV.UK's error message (`error`).
 */
export function AddressSearch({
  indexUrl,
  value = "",
  error = null,
}: {
  indexUrl: string;
  value?: string;
  error?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputClasses = error ? "govuk-input govuk-input--error" : "govuk-input";

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let note: Note = "none";
    let latest = "";

    // One request per page load, whichever comes first: focus, or the page
    // idle after load (not with Save-Data on). The first stops the other.
    let fetchIndex = () => {};
    const index: Promise<Matcher> = new Promise((resolve, reject) => {
      fetchIndex = () =>
        fetch(indexUrl)
          .then(async (res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            resolve(matcher((await res.json()) as SearchIndex));
          })
          .catch(reject);
    });
    const loadIndex = () => {
      stopIndex();
      fetchIndex();
    };
    container.addEventListener("focusin", loadIndex);
    const cancelPrefetch = saveData() ? () => {} : afterLoad(loadIndex);
    function stopIndex() {
      container?.removeEventListener("focusin", loadIndex);
      cancelPrefetch();
    }
    let match: Matcher | null = null;
    let failed = false;
    index.then(
      (m) => {
        match = m;
      },
      () => {
        failed = true;
      },
    );

    async function remote(q: string): Promise<SearchHit[] | null> {
      // Without the index, ask the server once typing settles.
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (q !== latest) return null;
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as SearchHit[];
    }

    async function source(
      query: string,
      populate: (options: Option[]) => void,
    ) {
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
        await index.catch(() => {});
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

    async function start() {
      const { default: accessibleAutocomplete } = await import(
        "accessible-autocomplete"
      );
      const old = container?.querySelector("input");
      if (cancelled || !container || !old) return;
      // Text in the field when the library loaded (the server's value on
      // /szukaj, or what was typed meanwhile), and whether the field had
      // focus (a tap before the page was idle).
      const typed = old.value;
      const focused = document.activeElement === old;
      // Render next to the placeholder and move focus to the new field in the
      // same task, then drop the placeholder: focus goes input to input (no
      // blur gap, so the phone keyboard stays) and nothing paints in between.
      old.removeAttribute("id");
      accessibleAutocomplete<Option>({
        element: container,
        id: INPUT_ID,
        source,
        name: "q",
        // No defaultValue: 3.0.2 would make it the only option (constructor,
        // autocomplete.js l. 69–70) and reopen the menu on it at focus
        // (handleInputFocus, l. 253–260), a bare-text "suggestion"; its
        // source runs only when the query changes (l. 218–232). The server's
        // value is in the placeholder instead and is handed over below as
        // typed text, so it is searched for real places, and appears once.
        // govuk-input--error survives the takeover (hintClasses, the
        // autoselect hint's field, follows inputClasses).
        inputClasses,
        menuAttributes: { "aria-labelledby": LABEL_ID },
        displayMenu: "overlay",
        autoselect: true,
        confirmOnBlur: false,
        templates: {
          inputValue: optionText,
          suggestion: (option: Option) => escapeHtml(optionText(option)),
        },
        tNoResults: () => NOTES[note],
        tStatusNoResults: () => NOTES[note],
        tStatusSelectedOption: (option: string, length: number, i: number) =>
          `${option}, ${i + 1} z ${length}, zaznaczony`,
        tStatusResults: (length: number, selected: string) =>
          `${addresses(length)} do wyboru. ${selected}`,
        // 3.0.2 sets the field's aria-describedby itself (to this text only,
        // and only until something is typed) and cannot add ids to it, so
        // adres-hint and adres-error are lost once it takes over: the error,
        // then the hint, are read from here instead.
        tAssistiveHint: () =>
          `${error ? `Błąd: ${error}. ` : ""}${HINT} Gdy pojawią się podpowiedzi, wybierz je strzałkami w górę i w dół i Enterem albo dotknij.`,
      });
      const input = container.querySelector<HTMLInputElement>(`#${INPUT_ID}`);
      if (focused) input?.focus();
      old.closest(".autocomplete__wrapper")?.remove();
      if (!input || !typed) return;
      // The library selects all text when its field first gains focus (after
      // its render), so hand over the typed text only after that render.
      // Keys pressed meanwhile are already in the new field: keep them too.
      // It searches on the input event, as for typing.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const text = typed + input.value;
      input.value = text;
      input.setSelectionRange(text.length, text.length);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    const cancelIdle = whenIdle(() => void start(), 2000, 200);
    return () => {
      cancelled = true;
      cancelIdle();
      stopIndex();
    };
  }, [indexUrl, error, inputClasses]);

  return (
    <search id={SEARCH_ID} className="app-search">
      <form method="get" action="/szukaj">
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
            Ulica albo wieś
          </label>
          <div id={HINT_ID} className="govuk-hint">
            {HINT}
          </div>
          {error && (
            <p id={ERROR_ID} className="govuk-error-message">
              <span className="govuk-visually-hidden">Błąd:</span> {error}
            </p>
          )}
          <div
            ref={containerRef}
            // accessible-autocomplete owns this element's children once the
            // page is idle; React never touches them.
            // biome-ignore lint/security/noDangerouslySetInnerHtml: a static field (value escaped), replaced by accessible-autocomplete
            dangerouslySetInnerHTML={{
              __html: placeholder(value, inputClasses, Boolean(error)),
            }}
          />
        </div>
        <button
          type="submit"
          className="govuk-button"
          data-module="govuk-button"
        >
          Szukaj
        </button>
      </form>
    </search>
  );
}
