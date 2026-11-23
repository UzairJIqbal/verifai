import type { MetadataRoute } from "next";
import { PUBLIC_PAGES, SITE_URL } from "@/src/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map((path) => ({ url: `${SITE_URL}${path}` }));
}
