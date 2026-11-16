import { NextRequest, NextResponse } from "next/server";
import { getShortUrl } from "@/lib/shortener/db";
import { errorCode } from "@/lib/utils/error-code";

// ── GET /api/shorten/[id] ─────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const { id } = params;

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  try {
    const record = await getShortUrl(id);

    if (!record) {
      return NextResponse.json({ error: "Short URL not found" }, { status: 404 });
    }

    // Check expiry
    if (record.expires_at !== null && record.expires_at < Math.floor(Date.now() / 1000)) {
      return NextResponse.json({ error: "Short URL has expired" }, { status: 410 });
    }

    return NextResponse.json({
      id:          record.id,
      originalUrl: record.original_url,
      clickCount:  record.click_count,
      createdAt:   record.created_at,
      expiresAt:   record.expires_at,
    });
  } catch (err) {
    console.error(`[GET /api/shorten/[id]] DB error (${errorCode(err)})`);
    return NextResponse.json({ error: "Failed to fetch short URL" }, { status: 500 });
  }
}
