import { IMGW_PAGE } from "@/lib/imgw-shown";
import { IMGW_ATTRIBUTION, IMGW_NAME } from "@/lib/imgw-warnings";

/**
 * IMGW-PIB's required wording (its terms, §5), its name linked to its
 * page: wherever its warnings are shown (the address page, the home page,
 * the preview), in the small print.
 */
export function ImgwSource() {
  return (
    <>
      {IMGW_ATTRIBUTION.source[0]}
      <a className="govuk-link" href={IMGW_PAGE}>
        {IMGW_NAME}
      </a>
      {`${IMGW_ATTRIBUTION.source[1]} ${IMGW_ATTRIBUTION.processed}`}
    </>
  );
}
