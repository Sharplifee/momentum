export default function PortalRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-navy to-[#243a56] font-sans text-white">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />
      <meta name="robots" content="noindex, nofollow" />
      {children}
    </div>
  );
}
