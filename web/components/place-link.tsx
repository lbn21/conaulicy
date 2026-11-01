"use client";

import Link from "next/link";
import { type ReactNode, useState } from "react";
import { addressPrefetch } from "@/lib/address-prefetch";

// Every link to an address page (task 238): Next.js's default prefetch (the
// address route's one App Shell) until someone shows intent, a pointer over
// the link, focus or a touch; then, for a canonical address page only
// (addressPrefetch), the full prefetch, its place's own static content
// (nextjs.org/docs/app/guides/prefetching#hover-triggered-prefetch, "With
// Partial Prefetching, use prefetch={active ? true : 'auto'}"). Never
// prefetch={true} on first render: eagerly, on the home page, it kept the
// network from going idle (CI, task 238). The same <a> as a plain <Link>:
// no markup, style or focus of its own.

export function PlaceLink({
  href,
  className,
  children,
}: {
  href: string;
  className: string;
  children: ReactNode;
}) {
  const [active, setActive] = useState(false);
  const activate = () => setActive(true);
  return (
    <Link
      href={href}
      prefetch={active ? addressPrefetch(href) : "auto"}
      className={className}
      onMouseEnter={activate}
      onFocus={activate}
      onTouchStart={activate}
    >
      {children}
    </Link>
  );
}
