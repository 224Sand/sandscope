import type { MetadataRoute } from "next";

import config from "@/generated/product.config.json";

/** Routes are listed rather than globbed: a sitemap that silently gains a page
 *  when someone adds a directory is a sitemap nobody reviews. */
const ROUTES = ["", "/story", "/handover", "/console", "/data", "/architecture",
                "/charter", "/lora", "/council", "/reliability", "/delivery",
                "/find"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return ROUTES.map((path) => ({
    url: `${config.frontendUrl}${path}`,
    lastModified: now,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : path === "/charter" ? 0.9 : 0.7,
  }));
}
