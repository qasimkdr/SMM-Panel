import { notFound } from "next/navigation";
import { UserHistory } from "@/components/admin/users/user-history";

export const metadata = { title: "User history" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return <UserHistory userId={id} />;
}
