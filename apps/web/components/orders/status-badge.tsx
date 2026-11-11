import { Badge } from "@/components/ui/badge";
import type { OrderRow } from "@/lib/hooks/orders";

const map: Record<OrderRow["status"], { label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" }> = {
  pending: { label: "Pending", tone: "neutral" },
  processing: { label: "Processing", tone: "info" },
  in_progress: { label: "In progress", tone: "info" },
  completed: { label: "Completed", tone: "success" },
  partial: { label: "Partial", tone: "warning" },
  canceled: { label: "Canceled", tone: "danger" },
  fail: { label: "Needs attention", tone: "danger" },
};

export const ORDER_TABS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "partial", label: "Partial" },
  { value: "canceled", label: "Canceled" },
];

export function StatusBadge({ status }: { status: OrderRow["status"] }) {
  const m = map[status] ?? map.pending;
  const live = status === "processing" || status === "in_progress";
  return (
    <Badge tone={m.tone}>
      {live && <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden />}
      {m.label}
    </Badge>
  );
}
