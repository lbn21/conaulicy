import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ImgwSource } from "@/components/imgw-source";
import { PageHead } from "@/components/page-head";
import { Status } from "@/components/parts";
import { SourceNote } from "@/components/subpage-parts";
import { WarningCards } from "@/components/warning-cards";
import { IMGW_SCENARIOS, imgwPreviewParams } from "@/lib/imgw-preview";
import { imgwCopy } from "@/lib/live-store";
import { weather, weatherNotices } from "@/lib/weather-module";

// IMGW's warnings for one mock scenario (lib/imgw-preview.ts), drawn as
// the address page draws them (components/hub.tsx): the notice in the
// inset, a card per warning, IMGW's wording in the small print. Outside
// production only: there, no page (dynamicParams = false, an empty list).

export const dynamicParams = false;
export const generateStaticParams = async () => imgwPreviewParams();

export const metadata: Metadata = {
  title: "Podgląd ostrzeżeń IMGW",
  robots: { index: false, follow: false },
};

export default async function ImgwPreview({
  params,
}: PageProps<"/podglad/imgw/[scenario]">) {
  const { scenario } = await params;
  const url = IMGW_SCENARIOS[scenario];
  if (!url) notFound();
  const now = Date.now();
  const data = weather(await imgwCopy(url), now);
  const notices = data ? weatherNotices(data) : [];
  return (
    <div className="govuk-width-container">
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <PageHead title="Podgląd ostrzeżeń IMGW" caption={scenario} />
          {notices.length > 0 && (
            <div className="govuk-inset-text">
              <Status groups={notices} />
            </div>
          )}
          <WarningCards warnings={data?.shown?.warnings ?? []} now={now} />
          <SourceNote source={data?.checkedAt != null && <ImgwSource />} />
        </div>
      </div>
    </div>
  );
}
