import { type ReactNode, Suspense } from "react";
import { LOADING } from "@/components/skeleton";

// An address page's whole content and its breadcrumbs
// (components/place-suspense.tsx): its own <Suspense> boundary, because a
// route's App Shell, shared by every link to it, cannot hold one place's
// content (nextjs.org/docs/app/guides/adopting-partial-prefetching). On a
// load of the place alone the boundary is complete in the prerendered
// HTML: no skeleton, no reveal. Its skeleton shows only where the content
// waits on something: a client-side navigation the prefetch has not
// filled, and ?nr= or ?imgw=, read per request (components/hub-route.tsx).
// There the content replaces the skeleton at once: no fade and no view
// transition, so nothing animates on any load and a reload keeps its
// scroll.

/**
 * A live block: `children` is an async Server Component that reads its own
 * data (cached as "live", next.config.ts); `skeleton` its typical shape
 * (BlockSkeleton).
 */
export function LiveBlock({
  skeleton,
  children,
}: {
  skeleton: ReactNode;
  children: ReactNode;
}) {
  return <Suspense fallback={skeleton}>{children}</Suspense>;
}

/**
 * A block's placeholder: one visually hidden „Sprawdzamy…” for screen
 * readers, then its typical shape (Skeleton bars in its own elements and
 * GOV.UK classes), hidden from them. No aria-busy and no live region: the
 * placeholder is replaced, never updated in place (components/skeleton.tsx).
 */
export function BlockSkeleton({ children }: { children: ReactNode }) {
  return (
    <div>
      <p className="govuk-visually-hidden">{LOADING}</p>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}
