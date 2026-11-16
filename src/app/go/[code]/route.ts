import { NextRequest, NextResponse } from "next/server";
import { getShortUrl, incrementClick, cleanExpiredUrls } from "@/lib/shortener/db";
import { errorCode } from "@/lib/utils/error-code";

// ── GET /go/[code] ────────────────────────────────────────────────────────────
// This route handler is intentionally placed outside [locale] so that
// next-intl middleware does not interfere with the redirect.
//
// All redirects are temporary and uncacheable: a short URL can expire, and a
// cached 301 would keep sending browsers to the target (and skip the click
// count) after that.

function redirect(url: string, status: 302 | 307): NextResponse {
  return NextResponse.redirect(url, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { code: string } }
): Promise<NextResponse> {
  const { code } = params;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://pikaedit.com";

  const notFoundUrl = new URL(`${baseUrl}/en/developer/url-shortener`);
  notFoundUrl.searchParams.set("error", "notfound");

  const expiredUrl = new URL(`${baseUrl}/en/developer/url-shortener`);
  expiredUrl.searchParams.set("error", "expired");

  if (!code || typeof code !== "string") {
    return redirect(notFoundUrl.toString(), 302);
  }

  let record;
  try {
    record = await getShortUrl(code);
  } catch (err) {
    console.error(`[GET /go/[code]] DB error (${errorCode(err)})`);
    return redirect(notFoundUrl.toString(), 302);
  }

  if (!record) {
    return redirect(notFoundUrl.toString(), 302);
  }

  // Check expiry
  if (record.expires_at !== null && record.expires_at < Math.floor(Date.now() / 1000)) {
    // Clean up expired entries in the background
    cleanExpiredUrls().catch(() => {});
    return redirect(expiredUrl.toString(), 302);
  }

  // Increment click count in the background — do not block the redirect
  incrementClick(code).catch(() => {});

  return redirect(record.original_url, 307);
}
