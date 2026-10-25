import { checkedLine } from "@/lib/hub";

/**
 * When a module last checked its source (Module.checkedAt), in one place
 * for its card and its subpage: small, secondary text. Nothing for null.
 */
export function CheckedLine({
  at,
  className = "",
}: {
  at: Date | null;
  className?: string;
}) {
  const line = checkedLine(at);
  if (!line) return null;
  return (
    <p className={`govuk-hint govuk-!-font-size-16 ${className}`.trim()}>
      {line}
    </p>
  );
}
