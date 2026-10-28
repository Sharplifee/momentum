import { getServiceArea } from "@/lib/serviceArea";
import { QuoteForm } from "@/components/marketing/QuoteForm";

export const dynamic = "force-dynamic";

/** The city picker is fed from the zones table — one source of truth for the service area. */
export default async function QuotePage() {
  const area = await getServiceArea();
  const cities = [...area.cities].sort((a, b) => a.localeCompare(b));
  return <QuoteForm cities={cities} />;
}
