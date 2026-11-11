import { LegalPage, legalMetadata } from "@/components/marketing/legal-page";

export const revalidate = 300;
export const generateMetadata = () => legalMetadata("refund");
export default function Page() {
  return <LegalPage slug="refund" />;
}
