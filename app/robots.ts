import type { MetadataRoute } from 'next';

/**
 * Treatment Companion is a private clinical app — it must not be search-indexed.
 * This emits a robots.txt that disallows all crawlers; the X-Robots-Tag:
 * noindex response header (next.config.ts) enforces the same at the HTTP level.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', disallow: '/' }
  };
}
