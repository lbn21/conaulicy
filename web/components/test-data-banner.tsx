// Shown on every page while the database holds the seed (meta.testData).
export function TestDataBanner() {
  return (
    <div className="border-b-4 border-danger bg-surface-2">
      <p className="mx-auto flex w-full max-w-2xl flex-wrap items-center gap-x-3 px-4 md:px-8">
        <strong className="py-2">
          Dane testowe – terminy nie są prawdziwe
        </strong>
        <a
          href="/dane-testowe"
          className="inline-flex min-h-12 items-center underline decoration-2 underline-offset-4"
        >
          Co to znaczy?
        </a>
      </p>
    </div>
  );
}
