import { checkedLine } from "@/lib/hub";

/**
 * When a module last checked its source (Module.checkedAt), in one place
 * for its card (a span under its last source) and its subpage (a
 * paragraph): small, secondary text. Nothing for null.
 */
export function CheckedLine({
  at,
  as: Tag = "p",
  className = "",
}: {
  at: Date | null;
  as?: "p" | "span";
  className?: string;
}) {
  const line = checkedLine(at);
  if (!line) return null;
  return (
    <Tag className={`govuk-hint govuk-!-font-size-16 ${className}`.trim()}>
      {line}
    </Tag>
  );
}
