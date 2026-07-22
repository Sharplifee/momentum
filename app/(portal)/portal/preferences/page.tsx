import { requireCustomer } from "@/lib/portal";
import { PortalShell } from "@/components/portal/PortalShell";
import { PreferencesForm } from "@/components/portal/PreferencesForm";

export const dynamic = "force-dynamic";

export default async function Preferences() {
  const { customer } = await requireCustomer();
  return (
    <PortalShell name={customer.full_name?.split(" ")[0] ?? ""}>
      <h1 className="mb-4 text-2xl font-bold">Contact preferences</h1>
      <PreferencesForm initial={{ reminder_opt_out: customer.reminder_opt_out ?? false, marketing_opt_out: customer.marketing_opt_out ?? false, sms_opt_out: customer.sms_opt_out ?? false }} />
      <p className="mt-6 text-xs text-white/40">
        Want a copy of your data, a correction, or deletion? Email{" "}
        <a href="mailto:admin@momentumlandscapingut.com?subject=Privacy%20request" className="underline">admin@momentumlandscapingut.com</a>{" "}
        per our <a href="/legal/privacy-choices" className="underline">privacy choices</a>.
      </p>
    </PortalShell>
  );
}
