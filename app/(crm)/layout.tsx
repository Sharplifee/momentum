export default function CrmRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-stone-100 text-stone-900 dark:bg-stone-950 dark:text-stone-100">{children}</div>;
}
