"use client";

import { PageHeader, Skeleton } from "@/components/dashboard/page-header";
import { ServicesTable } from "@/components/services/services-table";
import { useCatalog, useCurrency, useMe } from "@/lib/hooks/queries";

export default function DashboardServices() {
  const { data, isLoading } = useCatalog();
  const currency = useCurrency();
  const { data: me } = useMe();
  return (
    <>
      <PageHeader
        title="Services"
        description={
          me?.discount && Number(me.discount) > 0
            ? `Prices include your ${Number(me.discount)}% VIP discount.`
            : "Prices per 1,000 in your currency."
        }
      />
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <ServicesTable catalog={data ?? []} currency={currency} />
      )}
    </>
  );
}
