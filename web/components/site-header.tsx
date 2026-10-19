import { ThemeSwitch } from "@/components/theme-switch";

export function SiteHeader() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 px-4 py-2 md:px-8">
        <a
          href="/"
          className="inline-flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 py-2 no-underline"
        >
          <svg
            aria-hidden="true"
            width="14"
            height="20"
            viewBox="0 0 14 20"
            className="shrink-0"
          >
            <rect width="14" height="20" rx="1" fill="var(--accent)" />
            <path
              d="M7 0v20M0 9h14"
              stroke="var(--background)"
              strokeWidth="1.5"
            />
          </svg>
          <span className="text-lg font-bold tracking-tight">conaulicy</span>
          <span className="text-text-muted">Lubaczów</span>
        </a>
        <ThemeSwitch />
      </div>
    </header>
  );
}
