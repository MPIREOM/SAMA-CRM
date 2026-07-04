/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Linting is run separately; don't block production builds.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
