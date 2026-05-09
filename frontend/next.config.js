/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['www.sec.gov', 'efts.sec.gov'],
  },
}

module.exports = nextConfig
