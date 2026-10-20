"use client";

import type { AnchorHTMLAttributes, KeyboardEvent } from "react";

// A link styled as a button, exactly as GOV.UK documents it (role="button",
// draggable="false"). A role of button promises Space activates it; GOV.UK
// does that with its Button JS (2.0 KB gzip), we with this one handler.
export function LinkButton(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: GOV.UK's link button: it navigates, so it stays a link
    <a
      {...props}
      role="button"
      draggable="false"
      className="govuk-button"
      onKeyDown={(event: KeyboardEvent<HTMLAnchorElement>) => {
        if (event.key === " ") {
          event.preventDefault();
          event.currentTarget.click();
        }
      }}
    />
  );
}
