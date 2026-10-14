import type { NextConfig } from "next";
import { isLocalOnlyEnabled } from "./src/local";

const nextConfig: NextConfig = {
  /* config options here */
  // On your machine the app opens on the playground; deployed, where the
  // playground is hidden, it opens on the runs.
  async redirects() {
    return [{ source: "/", destination: isLocalOnlyEnabled() ? "/playground" : "/runs", permanent: false }];
  },
  cacheComponents: true,
  partialPrefetching: true,
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
