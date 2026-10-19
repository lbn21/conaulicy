export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-1 px-4 py-8 md:px-8">
        <p className="max-w-prose">
          Nie jesteśmy urzędem – obowiązuje harmonogram gminy
        </p>
        <a
          href="/prywatnosc"
          className="inline-flex min-h-12 items-center self-start underline decoration-2 underline-offset-4"
        >
          Prywatność
        </a>
      </div>
    </footer>
  );
}
