import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { getServiceArea, citiesSentence } from "@/lib/serviceArea";
import EventLogClient from "@/components/EventLogClient";
import { supabaseServer } from "@/lib/supabase/server";
import { VIEW_AS_COOKIE, CAN_PREVIEW } from "@/lib/crm";
import { cookies } from "next/headers";

// Tight grotesk for display, neutral grotesk for body, mono for micro-labels and IDs.
const display = Inter_Tight({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display", display: "swap" });
const body = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const area = await getServiceArea();
  return {
  title: `Momentum Landscaping | Lawn Care in the ${area.short}`,
  description:
    `Weekly and biweekly lawn maintenance, aeration, and cleanups across ${citiesSentence(area, 4)}.`,
  other: {
    "facebook-domain-verification": process.env.NEXT_PUBLIC_META_DOMAIN_VERIFICATION ?? "",
  },
  };
}

// viewport-fit=cover lets the page run under the notch and the home indicator
// inside the iOS WebView shells; the Shell pads header and tab bar with the
// safe-area insets so nothing hides behind them.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

async function resolveTheme(): Promise<{ theme: "field" | "evening" | "auto"; density: "field" | undefined }> {
  // Default: evening (admin dark)
  const db = supabaseServer();
  const { data } = await db.auth.getUser();
  const user = data.user;
  if (!user) return { theme: "evening", density: undefined };
  const { data: profile } = await db.from("profiles").select("role, theme_pref").eq("id", user.id).single();
  const role = (profile?.role ?? "customer") as "owner" | "manager" | "crew" | "customer";
  const viewAs = (await cookies()).get(VIEW_AS_COOKIE)?.value;
  const previewing = viewAs === "crew" && CAN_PREVIEW.includes(role as any);
  const pref = (profile?.theme_pref as "auto" | "field" | "evening" | null) ?? "auto";
  // Auto → crew role or preview = field; else evening
  const useField = previewing || role === "crew" || pref === "field";
  const theme: "field" | "evening" = useField ? "field" : "evening";
  const density = useField ? "field" : undefined;
  return { theme, density };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { theme, density } = await resolveTheme();
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable}`}
      data-theme={theme}
      data-density={density}
      suppressHydrationWarning
    >
      <body className="min-h-screen font-sans antialiased">
        <EventLogClient />
        {children}
      </body>
    </html>
  );
}
