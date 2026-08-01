/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },

  // Each subdomain opens its own app. crm.* is the CRM, portal.* is the
  // customer portal — neither should land on the public marketing page.
  async redirects() {
    return [
      {
        source: "/",
        has: [{ type: "host", value: "crm.momentumlandscapingut.com" }],
        destination: "/crm",
        permanent: false,
      },
      {
        source: "/",
        has: [{ type: "host", value: "portal.momentumlandscapingut.com" }],
        destination: "/portal",
        permanent: false,
      },
      // The marketing site lives on its own project at momentumlandscapingut.com.
      // Anyone hitting those pages via the CRM host is in the wrong place.
      {
        source: "/quote",
        has: [{ type: "host", value: "crm.momentumlandscapingut.com" }],
        destination: "/crm",
        permanent: false,
      },
    ];
  },
};
export default nextConfig;
