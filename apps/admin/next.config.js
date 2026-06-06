/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL || "https://api.eurowindowlightcity.net",
    NEXT_PUBLIC_CHATWOOT_URL:
      process.env.NEXT_PUBLIC_CHATWOOT_URL || "https://chat.eurowindowlightcity.net",
  },
};

module.exports = nextConfig;
