import { statSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { LogoExample, type Misuse } from "@/components/brand-examples";
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

export const metadata: Metadata = {
  title: "Marka",
  description:
    "Logo conaulicy.pl do pobrania, kolory, czcionka i to, jak o nas pisać.",
};

// Built by docs/logo/source/ship_a.mjs; the rules are in docs/brand.md.
const FILES = "/marka/pliki";

function size(file: string): string {
  const bytes = statSync(path.join(process.cwd(), "public", FILES, file)).size;
  return `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

const LINK =
  "inline-flex min-h-12 items-center underline decoration-2 underline-offset-4";

const PANELS = {
  dark: { background: "#10141d", label: "na ciemne tło" },
  light: { background: "#f5f7fa", label: "na jasne tło" },
  mono: { background: "#ffffff", label: "jednokolorowe" },
} as const;

type Panel = keyof typeof PANELS;

const FILE_NAME: Record<Panel, string> = {
  dark: "ciemne-tlo",
  light: "jasne-tlo",
  mono: "jednokolorowe",
};

function Downloads({ kind, panel }: { kind: "logo" | "znak"; panel: Panel }) {
  const base = `conaulicy-${kind}-${FILE_NAME[panel]}`;
  const what = `${kind === "logo" ? "logo" : "znak"} ${PANELS[panel].label}`;
  return (
    <ul className="flex flex-wrap gap-x-6">
      {(["svg", "png"] as const).map((format) => (
        <li key={format}>
          <a
            href={`${FILES}/${base}.${format}`}
            download={`${base}.${format}`}
            className={LINK}
          >
            Pobierz {format.toUpperCase()} ({size(`${base}.${format}`)})
            <span className="sr-only">: {what}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function Variant({ kind, panel }: { kind: "logo" | "znak"; panel: Panel }) {
  const lockup = kind === "logo";
  return (
    <li className="flex flex-col gap-2">
      <div
        className="flex min-h-24 items-center justify-center rounded border border-border p-6"
        style={{ background: PANELS[panel].background }}
      >
        {/* biome-ignore lint/performance/noImgElement: a static SVG preview, no optimisation needed */}
        <img
          src={`${FILES}/conaulicy-${kind}-${FILE_NAME[panel]}.svg`}
          alt=""
          width={lockup ? 225 : 66}
          height={lockup ? 40 : 54}
        />
      </div>
      <p className="font-bold">
        {lockup ? "Logo" : "Znak"} {PANELS[panel].label}
      </p>
      <Downloads kind={kind} panel={panel} />
    </li>
  );
}

// The lockup with its clear space: 1 P (a quarter of the plate height) on
// every side, dashed.
function ClearSpace() {
  const p = LOGO_HEIGHT / 4;
  const pad = p + 6;
  const w = LOGO_WIDTH + 2 * pad;
  const h = LOGO_HEIGHT + 2 * pad;
  return (
    <svg
      role="img"
      aria-labelledby="pole-ochronne-opis"
      width="300"
      height={Math.round((300 * h) / w)}
      viewBox={`${-pad} ${-pad} ${w} ${h}`}
      className="block h-auto max-w-full"
    >
      <title id="pole-ochronne-opis">
        Logo otoczone przerywaną ramką w odległości P od każdej krawędzi.
      </title>
      <mask
        id="pole-ochronne"
        maskUnits="userSpaceOnUse"
        x="0"
        y="0"
        width={PLATE_WIDTH}
        height={LOGO_HEIGHT}
      >
        <path fill="#fff" d={PLATE} />
        <path fill="none" stroke="#000" strokeWidth={RIM_WIDTH} d={RIM} />
        <path d={UL} />
      </mask>
      <rect
        x={-p}
        y={-p}
        width={LOGO_WIDTH + 2 * p}
        height={LOGO_HEIGHT + 2 * p}
        fill="none"
        stroke="var(--text-muted)"
        strokeWidth="0.6"
        strokeDasharray="2 1.5"
      />
      <path fill="var(--accent)" mask="url(#pole-ochronne)" d={PLATE} />
      <path fill="currentColor" d={WORDMARK} />
      <g fill="var(--text-muted)" fontSize="7" fontWeight="700">
        <text x={-p / 2} y={LOGO_HEIGHT / 2 + 2.5} textAnchor="middle">
          P
        </text>
        <text x={PLATE_WIDTH / 2} y={-p / 2 + 2.5} textAnchor="middle">
          P
        </text>
      </g>
    </svg>
  );
}

const EXAMPLES: Array<{ misuse?: Misuse; caption: string }> = [
  { caption: "Tak: logo takie, jak jest w plikach" },
  { misuse: "stretched", caption: "Nie: rozciągnięte albo ściśnięte" },
  { misuse: "recoloured", caption: "Nie: w innym kolorze niż bursztyn" },
  { misuse: "shadow", caption: "Nie: z cieniem, gradientem albo poświatą" },
  { misuse: "retyped", caption: "Nie: „ul.” przepisane inną czcionką" },
];

// Ratios copied from the contrast table in design/tokens.md
// (node design/contrast.mjs); never recomputed here.
const COLOURS = [
  {
    token: "accent",
    name: "Bursztyn (tabliczka)",
    dark: "#ffb547",
    light: "#9a5700",
  },
  {
    token: "text",
    name: "Tekst (napis conaulicy)",
    dark: "#e9edf2",
    light: "#161b24",
  },
  {
    token: "background",
    name: "Tło (widać je w „ul.”)",
    dark: "#10141d",
    light: "#f5f7fa",
  },
  {
    token: "accent-contrast",
    name: "Tekst na bursztynie",
    dark: "#10141d",
    light: "#ffffff",
  },
];

const CONTRAST = [
  {
    pair: "Bursztyn na tle (tabliczka, „ul.”)",
    dark: "10,49 : 1",
    light: "5,24 : 1",
  },
  { pair: "Tekst na tle", dark: "15,67 : 1", light: "16,09 : 1" },
  { pair: "Tekst na bursztynie", dark: "10,49 : 1", light: "5,62 : 1" },
];

const TONE = [
  {
    yes: "Jutro odbiór szkła.",
    no: "Informujemy, iż w dniu jutrzejszym nastąpi odbiór odpadów szklanych.",
  },
  {
    yes: "Wystaw pojemniki do 6:00.",
    no: "Uprzejmie prosimy o wystawienie pojemników przed godziną 6:00.",
  },
  {
    yes: "Gdyby coś się nie zgadzało, rację ma harmonogram gminy.",
    no: "Serwis nie ponosi odpowiedzialności za ewentualne nieścisłości.",
  },
];

function Swatch({ colour }: { colour: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-6 shrink-0 rounded-sm border border-border align-middle"
      style={{ background: colour }}
    />
  );
}

export default function BrandPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 md:px-8">
      <h1 className="mt-8 text-2xl font-bold tracking-tight md:mt-14 md:text-3xl">
        Marka
      </h1>
      <p className="mt-4 max-w-prose">
        Piszesz o conaulicy.pl w gazetce, na stronie parafii albo osiedla? Tu
        znajdziesz logo do pobrania i kilka prostych zasad, żeby wyglądało
        dobrze.
      </p>

      <div className="mt-8 flex flex-col gap-10">
        <section>
          <h2 className="text-lg font-bold">Logo</h2>
          <p className="mt-2 max-w-prose">
            Logo to bursztynowa tabliczka z napisem „ul.” i obok nazwa
            conaulicy. Sam znak, czyli tabliczka bez nazwy, pasuje tam, gdzie
            nazwa stoi już obok albo jest mało miejsca. Wersja jednokolorowa
            przyda się do druku w jednym kolorze. Pliki PNG mają przezroczyste
            tło.
          </p>
          <ul className="mt-6 grid gap-8 md:grid-cols-2">
            <Variant kind="logo" panel="dark" />
            <Variant kind="logo" panel="light" />
            <Variant kind="logo" panel="mono" />
            <Variant kind="znak" panel="dark" />
            <Variant kind="znak" panel="light" />
            <Variant kind="znak" panel="mono" />
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold">
            Wolne miejsce i najmniejszy rozmiar
          </h2>
          <p className="mt-2 max-w-prose">
            Wokół logo zostaw wolne miejsce: co najmniej P z każdej strony. P to
            jedna czwarta wysokości tabliczki. Nie stawiaj tam tekstu, linii ani
            innych znaków.
          </p>
          <div className="mt-4">
            <ClearSpace />
          </div>
          <ul className="mt-4 flex max-w-prose list-disc flex-col gap-2 pl-6">
            <li>
              Logo z nazwą: co najmniej 24 px wysokości na ekranie i 8 mm w
              druku.
            </li>
            <li>Sam znak: co najmniej 20 px wysokości.</li>
            <li>
              Mniejsze niż 20 px: tylko specjalne ikony, rysowane piksel po
              pikselu. Przy 16 px zawsze plik{" "}
              <a
                href={`${FILES}/conaulicy-favicon-16.svg`}
                download="conaulicy-favicon-16.svg"
                className="underline decoration-2 underline-offset-4"
              >
                ikona 16 px (SVG)
              </a>
              , nigdy pomniejszone logo.
            </li>
          </ul>
          <div className="mt-4 flex items-end gap-6">
            <figure className="flex flex-col items-center gap-1">
              {/* biome-ignore lint/performance/noImgElement: a 16 px SVG icon shown at its real size */}
              <img
                src={`${FILES}/conaulicy-favicon-16.svg`}
                alt=""
                width={16}
                height={16}
              />
              <figcaption className="text-text-muted">16 px</figcaption>
            </figure>
            <figure className="flex flex-col items-center gap-1">
              {/* biome-ignore lint/performance/noImgElement: a 32 px SVG icon shown at its real size */}
              <img
                src={`${FILES}/conaulicy-favicon-32.svg`}
                alt=""
                width={32}
                height={32}
              />
              <figcaption className="text-text-muted">32 px</figcaption>
            </figure>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold">Tak i nie</h2>
          <p className="mt-2 max-w-prose">
            Używaj gotowych plików i zmieniaj tylko ich wielkość, zawsze w
            proporcji. Nie obracaj logo, nie zamykaj go w kółku ani ramce i nie
            pokazuj samej tabliczki bez napisu.
          </p>
          <ul className="mt-6 grid gap-6 sm:grid-cols-2">
            {EXAMPLES.map(({ misuse, caption }) => (
              <li key={caption}>
                <figure
                  className={`flex h-full flex-col gap-3 rounded border-2 p-4 ${misuse ? "border-border" : "border-accent"}`}
                >
                  <div className="flex min-h-16 items-center">
                    <LogoExample
                      id={`przyklad-${misuse ?? "tak"}`}
                      misuse={misuse}
                    />
                  </div>
                  <figcaption>
                    <strong>{misuse ? "Nie" : "Tak"}</strong>
                    {caption.slice(caption.indexOf(":"))}
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold">Kolory</h2>
          <p className="mt-2 max-w-prose">
            Paleta nazywa się Latarnia: ciepłe światło lampy w oknie, kiedy na
            dworze już ciemno. Bursztyn to jedyny kolor akcentu. Kolory
            pojemników są tylko dla pojemników, nigdy dla logo.
          </p>
          <ul className="mt-4 flex flex-col">
            {COLOURS.map((c) => (
              <li key={c.token} className="border-b border-border py-3">
                <p>
                  {c.name} <span className="text-text-muted">({c.token})</span>
                </p>
                <dl className="mt-1 flex flex-wrap gap-x-6 gap-y-1">
                  {(["dark", "light"] as const).map((mode) => (
                    <div key={mode} className="flex items-center gap-2">
                      <dt>{mode === "dark" ? "Ciemny:" : "Jasny:"}</dt>
                      <dd className="flex items-center gap-2">
                        <Swatch colour={c[mode]} />
                        <code>{c[mode]}</code>
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
          <h3 className="mt-6 font-bold">Kontrast</h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-80 border-collapse text-left">
              <caption className="sr-only">Kontrast par kolorów logo</caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="py-2 pr-4">
                    Para
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    Ciemny
                  </th>
                  <th scope="col" className="py-2">
                    Jasny
                  </th>
                </tr>
              </thead>
              <tbody>
                {CONTRAST.map((c) => (
                  <tr key={c.pair} className="border-b border-border">
                    <th scope="row" className="py-3 pr-4 font-normal">
                      {c.pair}
                    </th>
                    <td className="whitespace-nowrap py-3 pr-4">{c.dark}</td>
                    <td className="whitespace-nowrap py-3">{c.light}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 max-w-prose text-text-muted">
            Liczby pochodzą z tabeli kontrastu w naszym projekcie
            (design/tokens.md), liczonej według WCAG 2.x. Wszystkie pary
            spełniają poziom AA.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold">Czcionka</h2>
          <p className="mt-2 max-w-prose">
            Piszemy czcionką Atkinson Hyperlegible Next, odmiany zwykła (400) i
            pogrubiona (700). Zaprojektował ją Braille Institute z myślą o
            osobach słabiej widzących. Jest bezpłatna, na licencji SIL Open Font
            License. Napisy w logo to ta sama czcionka, zamieniona na kształty.
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-6">
            <li>
              <a
                href="https://www.brailleinstitute.org/freefont/"
                className={LINK}
              >
                Atkinson Hyperlegible na stronie Braille Institute
              </a>
            </li>
            <li>
              <a href="https://openfontlicense.org/" className={LINK}>
                Licencja SIL Open Font License
              </a>
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold">Jak o nas piszemy</h2>
          <p className="mt-2 max-w-prose">
            Ciepło i zwyczajnie, jak sąsiad, który podpowiada przez płot.
            Krótkie zdania, codzienne słowa, „Ty” zamiast „Państwo”. Bez
            urzędowego tonu, haseł reklamowych i wykrzykników.
          </p>
          <ul className="mt-4 flex flex-col gap-4">
            {TONE.map((t) => (
              <li
                key={t.yes}
                className="grid gap-2 border-t border-border pt-4 sm:grid-cols-2"
              >
                <p>
                  <strong>Tak: </strong>„{t.yes}”
                </p>
                <p className="text-text-muted">
                  <strong className="text-text">Nie: </strong>„{t.no}”
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold">Kontakt dla mediów</h2>
          <p className="mt-2 max-w-prose">
            Potrzebujesz innego formatu albo chcesz o nas napisać? Odpiszemy.
          </p>
          <a href="mailto:kontakt@conaulicy.pl" className={`${LINK} font-bold`}>
            kontakt@conaulicy.pl
          </a>
        </section>
      </div>
    </main>
  );
}
