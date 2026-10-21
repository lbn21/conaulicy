// The waste schedule domain: the gmina's PDFs and the city's JPGs
// (docs/import.md).
import type { Domain, Extractor } from "../core/domain.ts";
import { DETECTORS, detectFromPages, EXTRACTORS } from "./adapters.ts";
import { check } from "./check.ts";

export const waste: Domain = {
  detectors: DETECTORS,
  // Its extractors read the sector and year its detectors add to each file.
  extractors: EXTRACTORS as Record<string, Extractor>,
  detectFromPages,
  check,
};
