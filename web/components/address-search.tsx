"use client";

import "accessible-autocomplete/dist/accessible-autocomplete.min.css";
import { useEffect, useRef } from "react";
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

// One search per page (the home page), so fixed ids.
const INPUT_ID = "adres";
const LABEL_ID = "adres-label";
const HINT_ID = "adres-hint";

const HINT =
  "Na przykład Asnyka 12 albo Lisie Jamy – polskie znaki nie są potrzebne";

// The same field accessible-autocomplete renders (its classes, GOV.UK's
// govuk-input), so nothing moves when it takes over on first focus.
const PLACEHOLDER = `<div class="autocomplete__wrapper"><input id="${INPUT_ID}" type="text" class="autocomplete__input autocomplete__input--default govuk-input" autocomplete="off" aria-describedby="${HINT_ID}"></div>`;

type Note = "hint" | "loading" | "error" | "none";

const NOTES: Record<Note, string> = {
  hint: "Wpisz nazwę ulicy.",
  loading: "Szukam…",
  error: "Błąd: coś nie zadziałało po naszej stronie. Spróbuj za chwilę.",
  none: "Brak wyników. Nie mamy jeszcze tej ulicy ani wsi – sprawdź przykładowe adresy poniżej.",
};

function addresses(n: number): string {
  if (n === 1) return "1 adres";
  const tens = n % 100;
  const ones = n % 10;
  if (ones >= 2 && ones <= 4 && (tens < 12 || tens > 14)) return `${n} adresy`;
  return `${n} adresów`;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// What accessible-autocomplete hands to the templates and onConfirm: our
// results, or a plain string (its options may be strings, e.g. it seeds
// them with defaultValue, which this field does not use).
type Option = SearchHit | string | undefined;

function optionText(option: Option): string {
  if (!option) return "";
  if (typeof option === "string") return option;
  return withHouseNumber(option.label, option.nr ?? null);
}

/**
 * The address search: alphagov accessible-autocomplete, unmodified, set up
 * through its documented options only. It and the index of every place load
 * on first focus, not with the page; then each keystroke is matched on the
 * device ("Asnyka 12" carries the house number to ?nr=). If the index cannot
 * load, settled queries go to /api/search.
 */
export function AddressSearch({ indexUrl }: { indexUrl: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let started = false;
    let note: Note = "none";
    let latest = "";

    const index: Promise<Matcher> = new Promise((resolve, reject) => {
      container.addEventListener(
        "focusin",
        () =>
          fetch(indexUrl)
            .then(async (res) => {
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              resolve(matcher((await res.json()) as SearchIndex));
            })
            .catch(reject),
        { once: true },
      );
    });
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
        populate(findPlaces(match, q));
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
      if (started) return;
      started = true;
      const { default: accessibleAutocomplete } = await import(
        "accessible-autocomplete"
      );
      const old = container?.querySelector("input");
      if (!container || !old) return;
      // Text typed while the library loaded, and whether the field had focus.
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
        name: "",
        inputClasses: "govuk-input",
        menuAttributes: { "aria-labelledby": LABEL_ID },
        displayMenu: "overlay",
        autoselect: true,
        confirmOnBlur: false,
        templates: {
          inputValue: optionText,
          suggestion: (option: Option) => escapeHtml(optionText(option)),
        },
        onConfirm: (option: Option) => {
          if (option && typeof option !== "string") {
            window.location.assign(placeHref(option));
          }
        },
        tNoResults: () => NOTES[note],
        tStatusNoResults: () => NOTES[note],
        tStatusSelectedOption: (option: string, length: number, i: number) =>
          `${option}, ${i + 1} z ${length}, zaznaczony`,
        tStatusResults: (length: number, selected: string) =>
          `${addresses(length)} do wyboru. ${selected}`,
        tAssistiveHint: () =>
          `${HINT} Gdy pojawią się podpowiedzi, wybierz je strzałkami w górę i w dół i Enterem albo dotknij.`,
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
      const value = typed + input.value;
      input.value = value;
      input.setSelectionRange(value.length, value.length);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function onFocus() {
      void start();
    }
    container.addEventListener("focusin", onFocus);

    // "Zmień adres" on a street page links to /#szukaj: an empty field, ready
    // to type in, with the list closed. Without JS the link still lands here.
    if (window.location.hash === `#${SEARCH_ID}`) {
      container.querySelector("input")?.focus();
    }
    return () => container.removeEventListener("focusin", onFocus);
  }, [indexUrl]);

  return (
    <search id={SEARCH_ID} className="app-search">
      <div className="govuk-form-group">
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
        <div
          ref={containerRef}
          // accessible-autocomplete owns this element's children after first
          // focus; React never touches them.
          // biome-ignore lint/security/noDangerouslySetInnerHtml: a static field, replaced by accessible-autocomplete
          dangerouslySetInnerHTML={{ __html: PLACEHOLDER }}
        />
      </div>
    </search>
  );
}
