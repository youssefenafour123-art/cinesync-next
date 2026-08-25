import type { MetadataRoute } from "next";
import { siteUrl } from "./layout";

/**
 * One entry, honestly.
 *
 * CineSync is a single route — every tab, title and profile is state inside
 * `/`, not an address of its own — so a sitemap listing invented URLs would
 * be a sitemap of 404s. It exists so that `robots.txt` points somewhere real
 * and a crawler learns the canonical address rather than guessing between the
 * apex, the `www` and whatever preview host linked here.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
  ];
}
