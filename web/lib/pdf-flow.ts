// Page flow for the PDF's text version: a month (its heading and its lines)
// is never split across pages. Only a month longer than a whole page breaks,
// and then its heading is repeated, "(ciąg dalszy)", on the next page.

/** Heights in pt: the heading with the space below it, each line, the gap after. */
export type Block = { head: number; lines: number[]; gap: number };

/** Where something goes: its page (0 = the first text page) and top. */
export type Spot = { page: number; y: number };

export type Placed = {
  head: Spot;
  lines: Spot[];
  /** Repeated headings, where a month longer than a page carries over. */
  continued: Spot[];
};

/**
 * Places blocks from `start` on the first page; later pages start at `top`,
 * and nothing goes below `bottom`.
 */
export function flow(
  blocks: Block[],
  start: number,
  top: number,
  bottom: number,
): Placed[] {
  let page = 0;
  let y = start;
  const sum = (lines: number[]) => lines.reduce((a, b) => a + b, 0);
  return blocks.map((block) => {
    const whole = block.head + sum(block.lines);
    // A month that fits a page starts on a new one rather than split; one
    // longer than a page needs its heading and first line together.
    const need =
      top + whole <= bottom ? whole : block.head + (block.lines[0] ?? 0);
    if (y + need > bottom && y > top) {
      page++;
      y = top;
    }
    const head = { page, y };
    y += block.head;
    const continued: Spot[] = [];
    const lines = block.lines.map((h) => {
      if (y + h > bottom) {
        page++;
        y = top;
        continued.push({ page, y });
        y += block.head;
      }
      const spot = { page, y };
      y += h;
      return spot;
    });
    y += block.gap;
    return { head, lines, continued };
  });
}
