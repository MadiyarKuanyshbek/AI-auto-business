import type { MetadataRoute } from "next";
import { products } from "@/lib/products";
import { SITE_URL } from "@/lib/siteUrl";

export default function sitemap(): MetadataRoute.Sitemap {
  const demoPages: MetadataRoute.Sitemap = products.flatMap((product) =>
    product.businesses.map((business) => ({
      url: `${SITE_URL}/demo/${product.id}/${business.slug}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  );

  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    ...demoPages,
  ];
}
