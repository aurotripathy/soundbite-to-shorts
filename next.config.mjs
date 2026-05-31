/** @type {import('next').NextConfig} */
// Where /api/* is proxied. Local dev hits the FastAPI uvicorn server; in
// production (Vercel) set API_PROXY_TARGET to the Cloud Run service URL.
const API_TARGET = process.env.API_PROXY_TARGET || 'http://127.0.0.1:8000';

const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_TARGET}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
