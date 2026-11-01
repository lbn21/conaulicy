"use client";

import Link from "next/link";
import { type ReactNode, useState } from "react";
import { addressPrefetch } from "@/lib/address-routes";

// A link in /ulice's long list of places (task 238). Next.js's default
// prefetch for all of them (the address route's one App Shell); a link's
// full prefetch, its place's own static content, only once someone shows
// intent: a pointer over it, focus, or a touch, as the docs ask for many
// visible links (nextjs.org/docs/app/guides/prefetching#hover-triggered-prefetch,
// "With Partial Prefetching, use prefetch={active ? true : 'auto'}").
// The same <a> as a plain <Link>: no markup, style or focus of its own.

export function PlaceLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const [active, setActive] = useState(false);
  const activate = () => setActive(true);
  return (
    <Link
      href={href}
      prefetch={active ? addressPrefetch(href) : "auto"}
      className="govuk-link"
      onMouseEnter={activate}
      onFocus={activate}
      onTouchStart={activate}
    >
      {children}
    </Link>
  );
}
