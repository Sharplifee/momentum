import type { Metadata } from "next";
import { DM_Sans, Instrument_Sans } from "next/font/google";
import "./globals.css";
import { MetaPixel } from "@/components/MetaPixel";

const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-display", display: "swap" });
const instrument = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: "Momentum Landscaping | Lawn Care in Northern Utah County",
  description:
    "Weekly and biweekly lawn maintenance, aeration, and cleanups across Lehi, Saratoga Springs, Eagle Mountain, and surrounding cities.",
  other: {
    "facebook-domain-verification": process.env.NEXT_PUBLIC_META_DOMAIN_VERIFICATION ?? "",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${instrument.variable}`} suppressHydrationWarning>
      <head>
        {/* set theme class before paint to avoid flash; defaults to light */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('mo-theme');if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-screen font-sans antialiased">
        <MetaPixel />
        {children}
      </body>
    </html>
  );
}
