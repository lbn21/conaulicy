const CONTACT_EMAIL = "kontakt@conaulicy.pl";

/** Our e-mail address as a mailto link. */
export function ContactLink() {
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} className="govuk-link">
      {CONTACT_EMAIL}
    </a>
  );
}
