import type { Metadata } from "next";
import "./globals.css";
import { MetaPixel } from "@/components/MetaPixel";

export const metadata: Metadata = {
  title: "Momentum Landscaping | Lawn Care in Northern Utah County",
  description:
    "Weekly and biweekly lawn maintenance, aeration, and cleanups across Lehi, Saratoga Springs, Eagle Mountain, and surrounding cities.",
  other: {
    // Meta Business Manager domain verification (build plan 3.5)
    "facebook-domain-verification": process.env.NEXT_PUBLIC_META_DOMAIN_VERIFICATION ?? "",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-50 text-stone-900 antialiased">
        <MetaPixel />
        {children}
      </body>
    </html>
  );
}
