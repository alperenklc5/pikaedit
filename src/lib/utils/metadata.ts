import type { Metadata } from "next";

/**
 * Builds canonical + hreflang alternates for a given page path and locale.
 * Use in every generateMetadata except guides (which has conditional counterpart logic)
 * and noindex pages (s/[id], notes/[id]).
 *
 * @param path  URL path after the locale segment, e.g. "pdf/merge" or "" for home.
 * @param locale  Current locale, e.g. "tr" or "en".
 */
export function buildAlternates(
  path: string,
  locale: string
): NonNullable<Metadata["alternates"]> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://pikaedit.com";
  const suffix = path ? `/${path}` : "";
  return {
    canonical: `${baseUrl}/${locale}${suffix}`,
    languages: {
      tr: `${baseUrl}/tr${suffix}`,
      en: `${baseUrl}/en${suffix}`,
      "x-default": `${baseUrl}/en${suffix}`,
    },
  };
}
