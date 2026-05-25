import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'icons.duckduckgo.com' },
      { protocol: 'https', hostname: 'icon.horse' },
      { protocol: 'https', hostname: 'brewindex-icons.t3.tigrisfiles.io' },
    ],
  },
};

export default nextConfig;
