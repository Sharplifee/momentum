import { MetaPixel } from "@/components/MetaPixel";

/** The pixel belongs on public pages only. It used to live in the root layout,
 *  which meant every staff screen in the CRM fired PageView and polluted audiences. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MetaPixel />
      {children}
    </>
  );
}
