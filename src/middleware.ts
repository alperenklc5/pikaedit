// Simplified for this repository: the live site's middleware also redirects
// English URLs of Turkish-only guides to /tr/guides/<slug> and the retired
// /<locale>/image/video-trim URL to the video editor. Neither page exists
// here, so only the next-intl locale routing is kept. The matcher is
// unchanged.
import createMiddleware from "next-intl/middleware";
import { locales, defaultLocale } from "@/i18n/config";

export default createMiddleware({
  locales,
  defaultLocale,
  // Keep "always" while on next-intl 3.x: with "as-needed", /tr/%09/host
  // redirects to http://host/ (open redirect, GHSA-8f24-v5vv-gm5j, fixed only
  // in next-intl 4.9.1; verified on 3.26.5). See README.md, "Security".
  localePrefix: "always",
  // Canonical hreflang is served via <link> tags in generateMetadata.
  alternateLinks: false,
});

export const config = {
  // Exclude API routes, Next.js internals, static files, and the /go redirect handler
  matcher: ["/((?!api|go|_next|_vercel|.*\\..*).*)"],
};
