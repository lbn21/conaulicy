import { ThemeSwitch } from "@/components/theme-switch";
import {
  LOGO_HEIGHT,
  LOGO_WIDTH,
  PLATE,
  PLATE_WIDTH,
  RIM,
  RIM_WIDTH,
  UL,
  WORDMARK,
} from "@/lib/logo";

export function SiteHeader() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-2 px-4 py-2 md:gap-4 md:px-8">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 md:flex-nowrap">
          <a
            href="/"
            className="inline-flex min-h-12 items-center py-1 no-underline"
          >
            <svg
              aria-hidden="true"
              width="180"
              height="32"
              viewBox={`0 0 ${LOGO_WIDTH} ${LOGO_HEIGHT}`}
              className="shrink-0"
            >
              <mask
                id="logo-plate"
                maskUnits="userSpaceOnUse"
                x="0"
                y="0"
                width={PLATE_WIDTH}
                height={LOGO_HEIGHT}
              >
                <path fill="#fff" d={PLATE} />
                <path
                  fill="none"
                  stroke="#000"
                  strokeWidth={RIM_WIDTH}
                  d={RIM}
                />
                <path d={UL} />
              </mask>
              <path fill="var(--accent)" mask="url(#logo-plate)" d={PLATE} />
              <path fill="currentColor" d={WORDMARK} />
            </svg>
            <span className="sr-only">conaulicy.pl – strona główna</span>
          </a>
          <span className="text-text-muted">Lubaczów</span>
        </div>
        <ThemeSwitch />
      </div>
    </header>
  );
}
