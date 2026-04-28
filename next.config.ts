import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    // 給 R2 圖片直連用 (避免 Next.js Image 自己 proxy)
    optimizePackageImports: ['lucide-react'],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.r2.dev' },
      { protocol: 'https', hostname: '*.r2.cloudflarestorage.com' },
    ],
  },
};

export default nextConfig;
