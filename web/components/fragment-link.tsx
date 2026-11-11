import Link from "next/link";
import type { ComponentProps } from "react";

/**
 * A link to an id on the same page (`#woda`), as every link inside the
 * site: Next.js's <Link>. A plain anchor to an id makes a history
 * entry the App Router does not know, so after it Back showed another
 * page's content under the address page's URL; a <Link> pushes its own
 * entry and scrolls to the id (nextjs.org/docs/app/api-reference/components/link).
 * No prefetch: the target is the page already shown.
 */
export function FragmentLink({
  href,
  ...props
}: Omit<ComponentProps<typeof Link>, "href" | "prefetch"> & {
  href: `#${string}`;
}) {
  return <Link href={href} prefetch={false} {...props} />;
}
