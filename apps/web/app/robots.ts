import type { MetadataRoute } from "next";
import { siteUrl } from "./layout";

/**
 * What crawlers may read.
 *
 * The catalogue is public and worth finding; `/api/*` is not — those routes
 * answer with JSON that means nothing in a search result, and several of them
 * take a query string, so leaving them open invites a crawler to walk every
 * search term it can imagine and warm nothing but the TMDB rate limit.
 *
 * `/auth/*` is excluded for a sharper reason: a callback URL carries a
 * single-use code, and a crawler that follows one spends it.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/auth/"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
