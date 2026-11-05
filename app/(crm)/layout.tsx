import { BiometricGate } from "@/components/crm/BiometricGate";

/**
 * Everything under /crm sits behind Face ID once a device has enrolled.
 *
 * The gate lives here rather than on the login page because that is the only
 * place it used to appear — which meant it helped when the session had expired
 * and never otherwise. A live session let anyone holding the phone straight in.
 */
// Runs before first paint. If this device enrolled Face ID and the app has
// been away longer than the gate allows, hide the server-rendered page until
// the gate decides — the same rule as BiometricGate (keys and window shared).
const PRE_PAINT = `(function(){try{if(!localStorage.getItem("mo.bio.v1"))return;var s=Number(sessionStorage.getItem("mo_bio_ok")||0);if(s&&Date.now()-s<${5 * 60_000})return;document.documentElement.classList.add("mo-locked")}catch(e){}})();`;

export default function CrmRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <script dangerouslySetInnerHTML={{ __html: PRE_PAINT }} />
      <BiometricGate>{children}</BiometricGate>
    </div>
  );
}
