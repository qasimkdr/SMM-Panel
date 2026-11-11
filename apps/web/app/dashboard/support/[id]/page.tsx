"use client";

import { useParams } from "next/navigation";
import { TicketView } from "@/components/support/tickets";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <TicketView id={id} />;
}
