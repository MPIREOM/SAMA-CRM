import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Linting is run separately (npm run lint); don't block production builds.
    ignoreDuringBuilds: true,
  },
  images: {
    // WebP only: AVIF encodes 5–10× slower on first hit for little gain on photos this size.
    formats: ["image/webp"],
    remotePatterns: [
      // Room images uploaded from the back-office (Supabase Storage bucket bk-room-images).
      { protocol: "https", hostname: "vsxesrhoovabgsmvodvh.supabase.co", pathname: "/storage/v1/object/public/**" },
    ],
  },
  async redirects() {
    // The legacy CRM bookings screens are superseded by the booking-engine back-office.
    return [
      { source: "/bookings", destination: "/reservations", permanent: false },
      { source: "/bookings/new", destination: "/reservations/new", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
