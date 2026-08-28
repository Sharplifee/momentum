import { BiometricGate } from "@/components/crm/BiometricGate";

/**
 * Everything under /crm sits behind Face ID once a device has enrolled.
 *
 * The gate lives here rather than on the login page because that is the only
 * place it used to appear — which meant it helped when the session had expired
 * and never otherwise. A live session let anyone holding the phone straight in.
 */
export default function CrmRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <BiometricGate>{children}</BiometricGate>
    </div>
  );
}
