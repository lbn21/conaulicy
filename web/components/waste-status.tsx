"use client";

import { Status } from "@/components/parts";
import { useWarsawToday } from "@/components/warsaw-today";
import type { PlaceView } from "@/lib/schedule";
import { wasteStatus } from "@/lib/waste-module";

/**
 * The address page's waste section's lines (lib/waste-module.ts
 * wasteStatus): the next pickup from the device's day on. The page is
 * cached until the next import or deploy, so the server's next pickup may
 * be over; as the waste subpage's dates (components/pickup-schedule.tsx).
 */
export function WasteStatus({ data }: { data: PlaceView }) {
  const today = useWarsawToday(data.today);
  return <Status groups={wasteStatus({ ...data, today })} />;
}
