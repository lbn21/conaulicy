const CONTACT_EMAIL = "kontakt@conaulicy.pl";

/** Our e-mail address as a mailto: URL (also the footer's „Kontakt”). */
export const CONTACT_HREF = `mailto:${CONTACT_EMAIL}`;

/** Our e-mail address as a mailto link. */
export function ContactLink() {
  return (
    <a href={CONTACT_HREF} className="govuk-link">
      {CONTACT_EMAIL}
    </a>
  );
}
