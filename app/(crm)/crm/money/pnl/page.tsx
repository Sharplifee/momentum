import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** /crm/money/pnl moved to /crm/accounting/pnl. */
export default function Pnl() {
  redirect("/crm/accounting/pnl");
}
