import type { Metadata } from "next";
import { NOT_FOUND_METADATA, PageNotFound } from "@/components/page-not-found";

// Next.js adds its own robots noindex to every 404; without the layout's
// index/follow tag next to it, that one is the only one.
export const metadata: Metadata = NOT_FOUND_METADATA;

export default function NotFound() {
  return (
    <>
      <PageNotFound />
    </>
  );
}
