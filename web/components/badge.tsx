import type { ReactNode } from "react";
import { Icon } from "@/components/icon";

// A badge (site.scss .app-badge), shadcn/ui's Badge on GOV.UK's type: a
// pill of 16px bold text. Tones: muted (grey), mod (the module's tint and
// ink, from the nearest .app-mod--*), alert (GOV.UK red, with the warning
// icon), strong (the text colour). Always words, never colour alone.

export type Tone = "muted" | "mod" | "alert" | "strong";

export function Badge({
  tone = "muted",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <strong
      className={
        tone === "muted" ? "app-badge" : `app-badge app-badge--${tone}`
      }
    >
      {tone === "alert" && <Icon name="alert" />}
      {children}
    </strong>
  );
}
