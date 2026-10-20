export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-1 px-4 py-8 md:px-8">
        <p className="max-w-prose">
          Nie jesteśmy urzędem – obowiązuje harmonogram gminy
        </p>
        <ul className="flex flex-wrap gap-x-6">
          <li>
            <a
              href="/prywatnosc"
              className="inline-flex min-h-12 items-center underline decoration-2 underline-offset-4"
            >
              Prywatność
            </a>
          </li>
          <li>
            <a
              href="/dostepnosc"
              className="inline-flex min-h-12 items-center underline decoration-2 underline-offset-4"
            >
              Dostępność
            </a>
          </li>
          <li>
            <a
              href="/marka"
              className="inline-flex min-h-12 items-center underline decoration-2 underline-offset-4"
            >
              Marka
            </a>
          </li>
        </ul>
      </div>
    </footer>
  );
}
