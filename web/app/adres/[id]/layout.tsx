// The address page and its subpages in GOV.UK's width container: every page
// holds its own, under the root layout's <main> (app/layout.tsx, t398).
export default function PlaceLayout({ children }: LayoutProps<"/adres/[id]">) {
  return <div className="govuk-width-container">{children}</div>;
}
