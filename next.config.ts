import type { NextConfig } from "next";
import { isLocalOnlyEnabled } from "./src/local";

const nextConfig: NextConfig = {
  /* config options here */
  // On your machine the app opens on the playground; deployed, where the
  // playground is hidden, it opens on the runs.
  async redirects() {
    return [{ source: "/", destination: isLocalOnlyEnabled() ? "/playground" : "/runs", permanent: false }];
  },
  // The pages read the committed record at request time, from paths the build
  // can't follow (they're marked turbopackIgnore). Deployed, a page that
  // renders on request has only the files listed here: never data/ (the shop
  // and the eval store) or an .env file.
  outputFileTracingIncludes: {
    "/*": [
      "./results/**/*",
      "./evals/**/*",
      "./agent/**/*",
      "./judges/**/*",
      "./verifai.config.json",
      "./docs/failure-taxonomy.md",
      "./CHANGELOG.md",
    ],
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
