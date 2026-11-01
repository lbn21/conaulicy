import { type ReactNode, Suspense, ViewTransition } from "react";
import { LOADING } from "@/components/skeleton";

// A block whose data changes between imports (IMGW, water, „Najbliższe
// dni”; power later): its own <Suspense> hole in the page's static shell
// (nextjs.org/docs/app/getting-started/caching, "Prerendering"), so the
// shell keeps its long lifetime and the block is read per request, its
// „Sprawdziliśmy” in the same read as its data. Its skeleton ships in the
// shell. When the block arrives, the skeleton leaves and the block comes in
// with React's <ViewTransition>, as Next.js's "Animate loading states with
// Suspense reveals" (nextjs.org/docs/app/guides/view-transitions); the
// motion is in app/site.scss: a short fade, no slide and no page crossfade,
// none under prefers-reduced-motion. Browsers
// without view transitions swap at once. One rule for every block.

/**
 * A live block: `children` is an async Server Component that reads its own
 * data (after `await io()`, so it is never prerendered); `skeleton` its
 * typical shape (BlockSkeleton).
 */
export function LiveBlock({
  skeleton,
  children,
}: {
  skeleton: ReactNode;
  children: ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <ViewTransition exit="app-leave" default="none">
          {skeleton}
        </ViewTransition>
      }
    >
      <ViewTransition enter="app-arrive" default="none">
        {children}
      </ViewTransition>
    </Suspense>
  );
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
