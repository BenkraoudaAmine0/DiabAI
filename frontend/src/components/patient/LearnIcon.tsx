import { Activity, HeartPulse, ShieldCheck } from "lucide-react";

import type { LearnTopic } from "@/lib/learn";

const ICONS = { activity: Activity, "heart-pulse": HeartPulse, "shield-check": ShieldCheck };

/** Figma Learn "Icon tile": 48px, #d6ebe5, 12px radius, 20px icon. */
export default function LearnIcon({ icon }: { icon: LearnTopic["icon"] }) {
  const IconCmp = ICONS[icon];
  return (
    <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-pt-mint text-pt-deep">
      <IconCmp size={20} strokeWidth={1.75} />
    </span>
  );
}
