import { PageHeader } from "@/components/dashboard/page-header";
import { RedeemCode } from "@/components/growth/redeem-code";
import { AddFunds } from "@/components/payments/add-funds";

export default function AddFundsPage() {
  return (
    <>
      <PageHeader title="Add funds" description="Pay with your wallet or Binance, then send us the transaction ID. Your balance updates once the payment is confirmed." />
      <AddFunds />
      <RedeemCode />
    </>
  );
}
