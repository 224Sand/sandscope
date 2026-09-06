import type { MetadataRoute } from "next";

import config from "@/generated/product.config.json";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // The API surface is live agent state, not content. Crawling it costs
      // quota on both sides and indexes nothing a reader wants.
      { userAgent: "*", allow: "/", disallow: ["/api/"] },
    ],
    sitemap: `${config.frontendUrl}/sitemap.xml`,
  };
}
