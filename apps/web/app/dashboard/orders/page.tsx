import { PageHeader } from "@/components/dashboard/page-header";
import { OrdersList } from "@/components/orders/orders-list";
import { buttonClass } from "@/components/ui/button";
import Link from "next/link";
import { CirclePlus } from "lucide-react";

export default function OrdersPage() {
  return (
    <>
      <PageHeader
        title="Orders"
        description="Live status, progress and refunds for every order. This page updates by itself."
        actions={
          <Link href="/dashboard/new-order" className={buttonClass("primary", "md")}>
            <CirclePlus className="size-4" aria-hidden /> New order
          </Link>
        }
      />
      <OrdersList />
    </>
  );
}
