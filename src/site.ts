// The deployed address and the code's home, for the pages crawlers read
// without running JavaScript: the sitemap, robots.txt and the JSON-LD.
export const SITE_URL = "https://verifai-phi-one.vercel.app";
export const REPO_URL = "https://github.com/UzairJIqbal/verifai";
export const SITE_DESCRIPTION =
  "An evaluation system for a customer-support agent of a made-up phone-accessories shop, with a claim checker and a release gate.";

// The read-only pages, the same here and deployed.
export const PUBLIC_PAGES = ["/runs", "/tasks", "/compare", "/failures", "/gates"] as const;
