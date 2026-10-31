import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** /crm/money was the invoice list; it now lives under Accounting. */
export default function Money({ searchParams }: { searchParams: { status?: string } }) {
  redirect(`/crm/accounting/invoices${searchParams.status ? `?status=${encodeURIComponent(searchParams.status)}` : ""}`);
}
