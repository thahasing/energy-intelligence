/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://energy-intelligence-production.up.railway.app',
  },
  images: {
    domains: ['www.sec.gov', 'efts.sec.gov'],
  },
}

module.exports = nextConfig
