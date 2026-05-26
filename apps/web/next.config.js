/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_AGENT_ENGINE_URL:
      process.env.NEXT_PUBLIC_AGENT_ENGINE_URL || "http://localhost:8000",
  },
};

module.exports = nextConfig;
