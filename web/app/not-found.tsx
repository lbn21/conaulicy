import type { Metadata } from "next";
import { ImgwBanner } from "@/components/imgw-banner";
import { NOT_FOUND_TITLE, PageNotFound } from "@/components/page-not-found";

export const metadata: Metadata = {
  title: NOT_FOUND_TITLE,
  // Next.js adds its own robots noindex to every 404; without the layout's
  // index/follow tag next to it, that one is the only one.
  robots: null,
};

export default function NotFound() {
  return (
    <>
      <ImgwBanner />
      <PageNotFound />
    </>
  );
}
