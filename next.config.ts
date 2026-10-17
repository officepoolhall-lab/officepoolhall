import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page here is per-user (reads the session cookie), so Cache Components'
  // static shell buys little and would require <Suspense> around every session read.
  // The classic model (cookies() makes a route dynamic) is simpler to maintain.
  cacheComponents: false,
  partialPrefetching: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
