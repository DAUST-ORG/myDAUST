/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export", // static site: S3 + Cloudflare, no server
  trailingSlash: true, // S3 website serves folder indexes, not extensionless keys
  reactStrictMode: true,
  transpilePackages: ["@mydaust/shared"],
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
    NEXT_PUBLIC_PORTAL_URL: process.env.NEXT_PUBLIC_PORTAL_URL ?? "http://localhost:3000",
  },
};

export default nextConfig;
