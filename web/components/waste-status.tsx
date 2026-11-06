"use client";

import { Status } from "@/components/parts";
import { useWarsawToday } from "@/components/warsaw-today";
import type { PlaceView } from "@/lib/schedule";
import { wasteStatus } from "@/lib/waste-module";

/**
 * The address page's waste section's lines (lib/waste-module.ts
 * wasteStatus): the next pickup from today on, the server's day, then the
 * device's, as a page can outlive its day (components/warsaw-today.tsx);
 * as the waste subpage's dates (components/pickup-schedule.tsx).
 */
export function WasteStatus({ data }: { data: PlaceView }) {
  const today = useWarsawToday();
  return <Status groups={wasteStatus({ ...data, today })} />;
}
