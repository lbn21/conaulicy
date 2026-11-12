// The CSS hack guard (t366 section 6, t368): our own stylesheets' source
// lines that position, size or nudge by a font's or a breakpoint's numbers
// instead of laying things out with flex, grid and GOV.UK's tokens. Each
// hit fails, unless the comment line right above the declaration allows it:
//
//   // css-allow R1: why it is needed, at least 20 characters
//   vertical-align: top;
//
// A tag covers the next declaration only, may name several rules
// (`css-allow R1, R7: …`), and must still be needed: a tag that allows
// nothing is itself a failure (R10). The source is read, not the
// compiled CSS, so GOV.UK's own never trips it.

export const RULES = {
  R1: "vertical-align with a length, or a line-box keyword (top, bottom): a font's numbers",
  R2: "an offset (top, right, bottom, left, inset) on an element positioned relative, or absolute/fixed outside a pseudo-element",
  R3: "a negative margin",
  R4: "a translate",
  R5: "a line-height other than 1 or 1.5 (GOV.UK's mixins set theirs)",
  R6: "a fixed height in px on a text box",
  R7: "a raw length (px, rem; em outside an icon's, tile's or bin's width and height; lh other than 1lh and .5lh)",
  R8: "!important",
  R9: "an inline style in markup",
  R10: "a css-allow that allows nothing, names no rule, or gives no reason",
};

/** Text-relative vertical-align keywords; top and bottom follow the line box. */
const TEXT_ALIGN = /^(baseline|middle|sub|super|text-top|text-bottom)$/;
const SIZED = /\.app-(icon|tile|bin)\b/;
const MIN_REASON = 20;

/** Split on commas outside parentheses. */
function topLevel(text) {
  const parts = [];
  let depth = 0;
  let part = "";
  for (const ch of text) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(part.trim());
      part = "";
    } else part += ch;
  }
  return [...parts, part.trim()].filter(Boolean);
}

const isPseudo = (selector) =>
  topLevel(selector).every((s) => /::[\w-]+(\([^)]*\))?$/.test(s));

/** A child selector resolved against its parent (& or descendant). */
function resolve(parent, selector) {
  if (parent == null) return selector;
  return topLevel(selector)
    .map((s) =>
      s.includes("&") ? s.replaceAll("&", parent) : `${parent} ${s}`,
    )
    .join(", ");
}

/**
 * Blocks of declarations from SCSS or CSS source: each declaration with
 * its property, value, line, resolved selector and the css-allow tag
 * right above it. Comments, strings and #{} interpolation are kept whole.
 */
function parse(source) {
  const blocks = [];
  const tags = [];
  const stack = [{ selector: null, decls: [] }];
  blocks.push(stack[0]);
  let buf = "";
  let start = null;
  let line = 1;
  let parens = 0;
  let pending = null;
  const flushDecl = () => {
    const text = buf.trim();
    buf = "";
    if (!text) return;
    const at = start;
    start = null;
    const m = /^(\$[\w-]+|-{0,2}[a-zA-Z][\w-]*|@[\w-]+)\s*:?\s*([\s\S]*)$/.exec(
      text,
    );
    if (!m) return;
    const decl = { prop: m[1].toLowerCase(), value: m[2].trim(), line: at };
    if (pending) {
      decl.allow = pending;
      pending = null;
    }
    stack.at(-1).decls.push(decl);
  };
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === "\n") line += 1;
    if (ch === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end < 0 ? source.length : end + 2;
      line += (source.slice(i, stop).match(/\n/g) ?? []).length;
      i = stop - 1;
      continue;
    }
    if (ch === "/" && next === "/" && parens === 0) {
      const end = source.indexOf("\n", i);
      const comment = source.slice(i + 2, end < 0 ? source.length : end).trim();
      const tag = /^css-allow\b\s*([^:]*):?\s*(.*)$/.exec(comment);
      if (tag) {
        if (pending) tags.push({ ...pending, unused: true });
        pending = {
          rules: tag[1].split(/[\s,]+/).filter(Boolean),
          reason: tag[2].trim(),
          line,
        };
      }
      i = (end < 0 ? source.length : end) - 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const end = source.indexOf(ch, i + 1);
      if (start == null) start = line;
      buf += source.slice(i, end + 1);
      i = end;
      continue;
    }
    if (ch === "#" && next === "{") {
      let depth = 0;
      let j = i + 1;
      for (; j < source.length; j++) {
        if (source[j] === "{") depth += 1;
        if (source[j] === "}" && --depth === 0) break;
      }
      if (start == null) start = line;
      buf += source.slice(i, j + 1);
      i = j;
      continue;
    }
    if (ch === "(") parens += 1;
    if (ch === ")") parens -= 1;
    if (ch === "{" && parens === 0) {
      const head = buf.trim();
      buf = "";
      start = null;
      const parent = stack.at(-1).selector;
      const atRule = head.startsWith("@");
      const keyframes = /^@keyframes\b/.test(head);
      const block = {
        selector: keyframes ? null : atRule ? parent : resolve(parent, head),
        keyframes: keyframes || stack.at(-1).keyframes,
        decls: [],
      };
      blocks.push(block);
      stack.push(block);
      continue;
    }
    if ((ch === ";" && parens === 0) || ch === "}") {
      flushDecl();
      if (ch === "}") stack.pop();
      continue;
    }
    if (start == null && ch.trim()) start = line;
    buf += ch;
  }
  flushDecl();
  if (pending) tags.push({ ...pending, unused: true });
  return { blocks, tags };
}

/** The rules a declaration breaks, in its block. */
function broken(decl, block) {
  const { prop, value } = decl;
  const selector = block.selector ?? "";
  const pseudo = isPseudo(selector);
  const hits = new Set();
  if (/!important/.test(value)) hits.add("R8");
  if (prop === "vertical-align" && !TEXT_ALIGN.test(value)) hits.add("R1");
  if (/^(top|right|bottom|left|inset(-[a-z-]+)?)$/.test(prop)) {
    const position = block.decls.find((d) => d.prop === "position")?.value;
    const nonZero = value.split(/\s+/).some((t) => t !== "0" && t !== "auto");
    if (
      nonZero &&
      (position === "relative" ||
        (/^(absolute|fixed|sticky)$/.test(position ?? "") && !pseudo))
    )
      hits.add("R2");
  }
  if (
    /^margin(-[a-z-]+)?$/.test(prop) &&
    /(^|[\s(,*+/])-(?=[\d.($])/.test(value)
  )
    hits.add("R3");
  if (prop === "transform" && /translate/.test(value)) hits.add("R4");
  if (
    prop === "line-height" &&
    /^\d*\.?\d+(px)?$/.test(value) &&
    !/^(1|1\.5)$/.test(value)
  )
    hits.add("R5");
  if (
    /^(min-|max-)?height$/.test(prop) &&
    /\d(px)\b/.test(value) &&
    !pseudo &&
    !SIZED.test(selector) &&
    !/\bsvg\b/.test(selector)
  )
    hits.add("R6");
  const plain = value.replace(/"[^"]*"|'[^']*'|url\([^)]*\)/g, "");
  for (const [, n, unit] of plain.matchAll(
    /(?<![\w$#.])(\d*\.?\d+)(px|rem|em|lh)\b/g,
  )) {
    if (unit === "lh" && /^(1|\.5|0\.5)$/.test(n)) continue;
    if (unit === "em" && /^(width|height)$/.test(prop) && SIZED.test(selector))
      continue;
    if (Number(n) === 0) continue;
    hits.add("R7");
  }
  return hits;
}

/**
 * Lint one stylesheet's source. Returns the failures (unallowed hits and
 * R10) and the allowed hacks, each with file, line, rule and declaration.
 */
export function lintCss(source, file) {
  const { blocks, tags } = parse(source);
  const failures = [];
  const allowed = [];
  for (const tag of tags)
    failures.push({
      file,
      line: tag.line,
      rule: "R10",
      text: `css-allow ${tag.rules.join(", ")} covers no declaration`,
    });
  for (const block of blocks) {
    if (block.keyframes) continue;
    for (const decl of block.decls) {
      const hits = broken(decl, block);
      const text = `${decl.prop}: ${decl.value}`;
      const allow = decl.allow;
      if (allow) {
        const bad = [];
        if (allow.rules.length === 0) bad.push("names no rule");
        for (const rule of allow.rules) {
          if (!Object.hasOwn(RULES, rule) || rule === "R10")
            bad.push(`names ${rule}, no such rule`);
          else if (!hits.has(rule)) bad.push(`allows ${rule}, not broken`);
        }
        if (allow.reason.length < MIN_REASON)
          bad.push(`reason under ${MIN_REASON} characters`);
        for (const why of bad)
          failures.push({
            file,
            line: allow.line,
            rule: "R10",
            text: `${text}: css-allow ${why}`,
          });
        if (bad.length === 0)
          allowed.push({
            file,
            line: decl.line,
            rules: allow.rules,
            reason: allow.reason,
            text,
          });
      }
      for (const rule of hits) {
        if (allow?.rules.includes(rule)) continue;
        failures.push({ file, line: decl.line, rule, text });
      }
    }
  }
  return { failures, allowed };
}

/** R9: style attributes or style objects in markup (never allowed). */
export function lintMarkup(source, file) {
  const failures = [];
  source.split("\n").forEach((text, i) => {
    if (/\bstyle=\{|\bstyle="|\bstyle:\s*\{/.test(text))
      failures.push({ file, line: i + 1, rule: "R9", text: text.trim() });
  });
  return failures;
}
