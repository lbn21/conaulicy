"use client";

import type { MouseEvent, ReactNode } from "react";
import { FragmentLink } from "@/components/fragment-link";

/**
 * A link to a form field on the same page (`#adres`) that puts the caret
 * in it, as GOV.UK's error summary does (govuk-frontend ErrorSummary,
 * focusTarget): neither a native jump to an id nor <Link>'s scroll focuses
 * the field, so a click (or Enter on the link) brings the field's label into
 * view and focuses the field, without the jump. Before hydration, or with
 * no such field, it is a plain FragmentLink.
 */
export function FieldLink({
  href,
  className,
  children,
}: {
  href: `#${string}`;
  className?: string;
  children: ReactNode;
}) {
  const focus = (event: MouseEvent<HTMLAnchorElement>) => {
    const field = document.getElementById(href.slice(1));
    if (!(field instanceof HTMLInputElement)) return;
    event.preventDefault();
    (field.labels?.[0] ?? field).scrollIntoView();
    field.focus({ preventScroll: true });
  };
  return (
    <FragmentLink href={href} className={className} onClick={focus}>
      {children}
    </FragmentLink>
  );
}
