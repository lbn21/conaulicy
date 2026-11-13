"use client";

import { setFocus } from "govuk-frontend/dist/govuk/common/index.mjs";
import { FragmentLink } from "@/components/fragment-link";
import { SKIP_TARGET_ID } from "@/lib/skip-target";

// GOV.UK's class for its skip link's focused target (its outline off).
const FOCUSED = "govuk-skip-link-focused-element";

/**
 * GOV.UK's skip link, „Przejdź do treści”, to the shown page's heading
 * block (components/skip-target.tsx). GOV.UK's SkipLink script finds its
 * target once, when it starts; here the target is the page's own, behind
 * <Suspense> on an address page and new after every client-side
 * navigation, so it is found on each click and focused as GOV.UK's script
 * does (its own setFocus and class). A FragmentLink
 * (components/fragment-link.tsx): Back works.
 */
export function SkipLink() {
  return (
    <FragmentLink
      href={`#${SKIP_TARGET_ID}`}
      className="govuk-skip-link"
      onClick={() => {
        const target = document.getElementById(SKIP_TARGET_ID);
        if (!target) return;
        setFocus(target, {
          onBeforeFocus: () => target.classList.add(FOCUSED),
          onBlur: () => target.classList.remove(FOCUSED),
        });
      }}
    >
      Przejdź do treści
    </FragmentLink>
  );
}
