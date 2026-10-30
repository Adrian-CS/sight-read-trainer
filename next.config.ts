import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Export estático: se sirve desde Cloudflare Pages sin servidor.
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
