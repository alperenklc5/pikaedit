import { NextRequest, NextResponse } from "next/server";
import { createShortUrl, cleanExpiredUrls } from "@/lib/shortener/db";
import { getClientIp } from "@/lib/utils/client-ip";
import { errorCode } from "@/lib/utils/error-code";

// ── Rate limiting ─────────────────────────────────────────────────────────────
// In-memory, resets on server restart. For production use Redis/Upstash.

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 10;

function checkRateLimit(ip: string): boolean {
  const now   = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of Array.from(rateLimitMap.entries())) {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  }
}, 10 * 60_000);

// ── Expiry options ────────────────────────────────────────────────────────────

const EXPIRY_SECONDS: Record<string, number | null> = {
  never: null,
  "7d":  7  * 24 * 60 * 60,
  "30d": 30 * 24 * 60 * 60,
  "1y":  365 * 24 * 60 * 60,
};

// ── POST /api/shorten ─────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(request.headers);

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Too many requests. Please try again in an hour." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { url, expiry } = body as Record<string, unknown>;

  // ── URL validation ──────────────────────────────────────────────────────────

  if (typeof url !== "string" || !url.trim()) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  const trimmedUrl = url.trim();

  if (trimmedUrl.length > 2048) {
    return NextResponse.json(
      { error: "URL is too long (max 2048 characters)" },
      { status: 400 }
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmedUrl);
  } catch {
    return NextResponse.json(
      { error: "Invalid URL. Must start with http:// or https://" },
      { status: 400 }
    );
  }

  // Only allow http/https protocols
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return NextResponse.json(
      { error: "Invalid URL. Only http:// and https:// protocols are allowed" },
      { status: 400 }
    );
  }

  // Block self-referential URLs (prevent pikaedit.com → pikaedit.com loops)
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://pikaedit.com";
  let baseHostname: string;
  try {
    baseHostname = new URL(baseUrl).hostname;
  } catch {
    baseHostname = "pikaedit.com";
  }

  if (parsedUrl.hostname === baseHostname || parsedUrl.hostname.endsWith(`.${baseHostname}`)) {
    return NextResponse.json(
      { error: "Cannot shorten a URL pointing to this site" },
      { status: 400 }
    );
  }

  // ── Expiry calculation ──────────────────────────────────────────────────────

  const expiryKey = typeof expiry === "string" && expiry in EXPIRY_SECONDS
    ? expiry
    : "never";

  const ttl = EXPIRY_SECONDS[expiryKey];
  const expiresAt = ttl !== null
    ? Math.floor(Date.now() / 1000) + ttl
    : null;

  // ── Create short URL ────────────────────────────────────────────────────────

  try {
    const id = await createShortUrl(trimmedUrl, expiresAt);

    // Opportunistic cleanup — non-critical
    cleanExpiredUrls().catch(() => {});

    const shortUrl = `${baseUrl}/go/${id}`;

    return NextResponse.json(
      {
        id,
        shortUrl,
        originalUrl: trimmedUrl,
        clickCount: 0,
        expiresAt,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error(`[POST /api/shorten] DB error (${errorCode(err)})`);
    return NextResponse.json({ error: "Failed to create short URL" }, { status: 500 });
  }
}
