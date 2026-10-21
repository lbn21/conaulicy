// The import's domains, by the `domain` names used in etl/sources.yaml. A new
// domain is a folder like waste/ plus one line here (docs/import.md).
import type { Domain } from "./core/domain.ts";
import { waste } from "./waste/index.ts";

export const DOMAINS: Record<string, Domain> = { waste };
