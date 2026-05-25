import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'icons.duckduckgo.com' },
      { protocol: 'https', hostname: 'icon.horse' },
      { protocol: 'https', hostname: 'roomy-breadbox-0sbir2el4w.t3.storage.dev' },
    ],
  },
};

export default nextConfig;
