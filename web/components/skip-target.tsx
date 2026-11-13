"use client";

import { type HTMLAttributes, useLayoutEffect, useRef } from "react";
import { SKIP_TARGET_ID } from "@/lib/skip-target";

/**
 * The skip link's target (docs/layout.md, Skip link): the start of a
 * page's heading block (PageHead's street line, else its h1; the home
 * page's h1), after the breadcrumbs, so „Przejdź do treści” passes them.
 * tabindex -1, as GOV.UK's target, so focus moves there (with JavaScript
 * off too). One id in the document: Next.js keeps a page left by a
 * client-side navigation in it, hidden (React's <Activity>, which runs
 * effects' cleanups when it hides a page and the effects again when it
 * shows it), so the hidden page's target gives the id up and takes it back.
 */
export function SkipTarget({
  as: Tag,
  ...props
}: { as: "h1" | "p" | "span" } & HTMLAttributes<HTMLElement>) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.id = SKIP_TARGET_ID;
    return () => element.removeAttribute("id");
  }, []);
  return (
    <Tag ref={ref as never} id={SKIP_TARGET_ID} tabIndex={-1} {...props} />
  );
}
