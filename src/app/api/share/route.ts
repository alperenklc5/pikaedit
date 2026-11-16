import { NextRequest, NextResponse } from "next/server";
import { createSharedFile, cleanExpiredFiles, MAX_DOWNLOADS_LIMIT } from "@/lib/share/db";
import { getClientIp } from "@/lib/utils/client-ip";
import { errorCode } from "@/lib/utils/error-code";
import { getExtension, SHARE_BLOCKED_EXTENSIONS } from "@/lib/utils/upload-extensions";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import { Readable, Transform } from "stream";
import { pipeline } from "stream/promises";
import type { ReadableStream as WebReadableStream } from "stream/web";

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB
const UPLOAD_DIR = path.join(process.cwd(), "data", "shared");
const PART_DIR = path.join(process.cwd(), "data", "temp");

class UploadTooLargeError extends Error {
  constructor() {
    super("upload too large");
    this.name = "UploadTooLargeError";
  }
}

/** Header values are URI-encoded by the client; malformed input becomes "". */
function decodeHeader(value: string | null): string {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

const EXPIRY_SECONDS: Record<string, number> = {
  "30m":  30 * 60,
  "1h":   3_600,
  "24h":  86_400,
  "3d":   3 * 86_400,
  "7d":   7 * 86_400,
};

// ── Rate limiting ─────────────────────────────────────────────────────────────

interface RateLimitEntry { count: number; resetAt: number; }
const rateLimitMap = new Map<string, RateLimitEntry>();
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_MAX = 5;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_MAX) return false;
  entry.count++;
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of Array.from(rateLimitMap.entries())) {
    if (now > v.resetAt) rateLimitMap.delete(k);
  }
}, 10 * 60_000);

// ── Disk space check ─────────────────────────────────────────────────────────

function isDiskAlmostFull(): boolean {
  try {
    // Works on Linux/macOS — on Windows returns empty, safely ignored
    const out = execSync(`df -k "${UPLOAD_DIR}" 2>/dev/null || echo ""`, {
      timeout: 2000,
      encoding: "utf8",
    });
    const lines = out.trim().split("\n");
    if (lines.length < 2) return false;
    const parts = lines[lines.length - 1].trim().split(/\s+/);
    const pctStr = parts.find((p) => p.endsWith("%"));
    if (!pctStr) return false;
    const pct = parseInt(pctStr, 10);
    return pct >= 80;
  } catch {
    return false;
  }
}

// ── Route config ─────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const maxDuration = 60;

// ── POST /api/share ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Rate limit
  const ip = getClientIp(request.headers);

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Too many uploads. Maximum 5 uploads per hour per IP." },
      { status: 429 }
    );
  }

  // Disk check
  if (isDiskAlmostFull()) {
    return NextResponse.json(
      { error: "Server storage is nearly full. Please try again later." },
      { status: 507 }
    );
  }

  // ── Request format ──────────────────────────────────────────────────────────
  // The body is the raw file (application/octet-stream) and is streamed to
  // disk; metadata travels in X-* headers (URI-encoded where it can contain
  // non-Latin-1 characters). Buffering a multipart body would hold the whole
  // file in memory several times over (measured: ~1.6 GB peak for 300 MB).
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/octet-stream")) {
    return NextResponse.json(
      { error: "Send the file as application/octet-stream." },
      { status: 415 }
    );
  }
  if (!request.body) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File exceeds the 500 MB limit." }, { status: 413 });
  }
  if (request.headers.get("content-length") === "0") {
    return NextResponse.json({ error: "File is empty." }, { status: 400 });
  }

  // File name
  const originalName = decodeHeader(request.headers.get("x-file-name")).trim().slice(0, 255);
  if (!originalName) {
    return NextResponse.json({ error: "No file name provided." }, { status: 400 });
  }

  // Extension validation
  const ext = getExtension(originalName);
  if (SHARE_BLOCKED_EXTENSIONS.has(ext)) {
    return NextResponse.json(
      { error: `File type "${ext}" is not allowed for security reasons.` },
      { status: 422 }
    );
  }

  // Sanitize filename — keep only safe characters
  const safeName = originalName
    .replace(/[^a-zA-Z0-9._\-À-ɏ]/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(0, 200);

  // MIME type as reported by the browser (informational only)
  const rawType = (request.headers.get("x-file-type") ?? "").trim();
  const mimeType = /^[\w.+-]+\/[\w.+-]+$/.test(rawType) && rawType.length <= 100 ? rawType : null;

  // Parse options
  const expiryKey = request.headers.get("x-expiry") || "24h";
  const ttl = EXPIRY_SECONDS[expiryKey] ?? EXPIRY_SECONDS["24h"];

  const passwordRaw = decodeHeader(request.headers.get("x-share-password"));
  if (passwordRaw.length > 200) {
    return NextResponse.json({ error: "Password is too long." }, { status: 400 });
  }

  // maxDownloads: absent, "" or "0" = unlimited; otherwise an integer
  // 1..MAX_DOWNLOADS_LIMIT. Anything else is rejected instead of guessed.
  const maxDlRaw = request.headers.get("x-max-downloads");
  let maxDownloads: number | null = null;
  if (maxDlRaw !== null && maxDlRaw !== "" && maxDlRaw !== "0") {
    const n = /^\d{1,4}$/.test(maxDlRaw) ? Number(maxDlRaw) : NaN;
    if (!Number.isInteger(n) || n < 1 || n > MAX_DOWNLOADS_LIMIT) {
      return NextResponse.json(
        { error: `maxDownloads must be an integer between 1 and ${MAX_DOWNLOADS_LIMIT}.` },
        { status: 400 }
      );
    }
    maxDownloads = n;
  }

  // ── Stream body to disk ─────────────────────────────────────────────────────
  // Written to data/temp first (the scheduled cleanup removes abandoned
  // partial files there), then renamed into data/shared once complete.
  const id = nanoid(8);
  const storedPath = path.join(UPLOAD_DIR, `${id}_${safeName}`);
  const partPath = path.join(PART_DIR, `share-${id}.part`);

  let received = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _enc, callback) {
      received += chunk.length;
      if (received > MAX_FILE_SIZE) {
        callback(new UploadTooLargeError());
        return;
      }
      callback(null, chunk);
    },
  });

  try {
    fs.mkdirSync(PART_DIR, { recursive: true });
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    await pipeline(
      Readable.fromWeb(request.body as WebReadableStream<Uint8Array>),
      limiter,
      fs.createWriteStream(partPath, { flags: "wx" })
    );
  } catch (err) {
    fs.rmSync(partPath, { force: true });
    if (err instanceof UploadTooLargeError) {
      return NextResponse.json({ error: "File exceeds the 500 MB limit." }, { status: 413 });
    }
    console.error(`[POST /api/share] write error (${errorCode(err)})`);
    return NextResponse.json({ error: "Failed to save file." }, { status: 500 });
  }

  if (received === 0) {
    fs.rmSync(partPath, { force: true });
    return NextResponse.json({ error: "File is empty." }, { status: 400 });
  }

  try {
    fs.renameSync(partPath, storedPath);
  } catch (err) {
    fs.rmSync(partPath, { force: true });
    console.error(`[POST /api/share] write error (${errorCode(err)})`);
    return NextResponse.json({ error: "Failed to save file." }, { status: 500 });
  }

  // Hash password
  let passwordHash: string | null = null;
  if (passwordRaw.trim()) {
    passwordHash = await bcrypt.hash(passwordRaw.trim(), 10);
  }

  // Expiry counts from the end of the upload, not its start
  const expiresAt = Math.floor(Date.now() / 1000) + ttl;

  // Save to DB
  try {
    await createSharedFile({
      id,
      original_name: originalName,
      stored_path: storedPath,
      file_size: received,
      mime_type: mimeType,
      password_hash: passwordHash,
      expires_at: expiresAt,
      max_downloads: maxDownloads,
    });
  } catch (err) {
    // Cleanup the file we just wrote
    fs.rmSync(storedPath, { force: true });
    console.error(`[POST /api/share] DB error (${errorCode(err)})`);
    return NextResponse.json({ error: "Failed to register file." }, { status: 500 });
  }

  // Opportunistic cleanup
  cleanExpiredFiles().catch(() => {});

  return NextResponse.json(
    { id, url: `/s/${id}`, expiresAt },
    { status: 201 }
  );
}
