import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  webpack: (config) => {
    config.resolve.alias.canvas = false; // pdfjs-dist no necesita canvas en el navegador
    return config;
  },
};

export default nextConfig;
