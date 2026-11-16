const withNextIntl = require("next-intl/plugin")("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // next/image is not used. With unoptimized: true the server answers
    // /_next/image with 404 instead of running the image optimizer.
    unoptimized: true,
  },
  experimental: {
    // Enables src/instrumentation.ts (scheduled cleanup). Default-on from Next 15.
    instrumentationHook: true,
  },
  async redirects() {
    return [];
  },
};

module.exports = withNextIntl(nextConfig);
