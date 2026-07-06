/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL || "https://api-happyhomethanhhoa.bdsg.land",
    NEXT_PUBLIC_CHATWOOT_URL:
      process.env.NEXT_PUBLIC_CHATWOOT_URL || "https://chat-happyhomethanhhoa.bdsg.land",
  },
};

module.exports = nextConfig;
