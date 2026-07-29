/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  // S3 website hosting resolves directory index documents, not extensionless
  // paths — /fleet/ works, /fleet.html-style routes don't
  trailingSlash: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
