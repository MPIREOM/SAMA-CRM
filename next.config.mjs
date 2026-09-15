import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Photos uploaded from the back-office live in Supabase Storage. The project
// host is listed explicitly and the configured URL is added too, so a local
// emulator (scripts/mock-supabase) or a different project works as well.
function supabaseImagePatterns() {
  const patterns = [{ protocol: "https", hostname: "vsxesrhoovabgsmvodvh.supabase.co", pathname: "/storage/v1/object/public/**" }];
  try {
    const u = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    if (u.hostname && u.hostname !== patterns[0].hostname) {
      patterns.push({ protocol: u.protocol.replace(":", ""), hostname: u.hostname, ...(u.port ? { port: u.port } : {}), pathname: "/storage/v1/object/public/**" });
    }
  } catch {
    // unset or invalid: the explicit project host above still applies
  }
  return patterns;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Linting is run separately (npm run lint); don't block production builds.
    ignoreDuringBuilds: true,
  },
  images: {
    // WebP only: AVIF encodes 5–10× slower on first hit for little gain on photos this size.
    formats: ["image/webp"],
    // Room / website images uploaded from the back-office (Supabase Storage bucket bk-room-images).
    remotePatterns: supabaseImagePatterns(),
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
