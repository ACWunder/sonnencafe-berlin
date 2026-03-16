// src/components/SunStatusBadge.tsx

import type { SunStatus } from "@/types";
import { STATUS_LABELS, STATUS_EMOJI } from "@/lib/shadow";

interface SunStatusBadgeProps {
  status: SunStatus;
  size?: "sm" | "md";
  showLabel?: boolean;
}

const STATUS_STYLES: Record<SunStatus, string> = {
  sunny:
    "bg-sun-100 text-sun-700 border border-sun-300",
  partial:
    "bg-partial-100 text-partial-400 border border-partial-200",
  shady:
    "bg-shade-100 text-shade-400 border border-shade-200",
};

export function SunStatusBadge({
  status,
  size = "sm",
  showLabel = true,
}: SunStatusBadgeProps) {
  const padding = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-body font-medium ${padding} ${STATUS_STYLES[status]}`}
    >
      <span>{STATUS_EMOJI[status]}</span>
      {showLabel && <span>{STATUS_LABELS[status]}</span>}
    </span>
  );
}
