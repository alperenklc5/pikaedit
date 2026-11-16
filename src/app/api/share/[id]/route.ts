import { NextRequest, NextResponse } from "next/server";
import {
  getSharedFile,
  claimDownload,
  refundDownload,
  deleteSharedFile,
  cleanExpiredFiles,
} from "@/lib/share/db";
import bcrypt from "bcryptjs";
import { errorCode } from "@/lib/utils/error-code";
import { getClientIp } from "@/lib/utils/client-ip";
import {
  clearFailedPasswords,
  passwordRetryAfterSeconds,
  recordFailedPassword,
} from "@/lib/share/password-attempts";
import fsp, { type FileHandle } from "fs/promises";
import {
  acquireDownloadLease,
  activeDownloads,
  createTrackedDownloadStream,
} from "@/lib/share/download";

// ── GET /api/share/[id]  —  metadata only ───────────────────────────────────
// For password-protected files only existence, "password required" and the
// limit flag are returned; name, size, type, expiry and download counts stay
// hidden until the password is verified on download.

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const { id } = params;

  // Opportunistic cleanup
  cleanExpiredFiles().catch(() => {});

  if (!id || typeof id !== "string" || id.length > 20) {
    return NextResponse.json({ error: "Invalid file ID." }, { status: 400 });
  }

  const now = Math.floor(Date.now() / 1000);

  try {
    const file = await getSharedFile(id);

    if (!file) {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }

    if (file.expires_at < now) {
      await deleteSharedFile(id);
      return NextResponse.json({ error: "File has expired." }, { status: 410 });
    }

    // Check if max downloads reached (don't delete yet — let POST handle it)
    const limitReached =
      file.max_downloads !== null && file.download_count >= file.max_downloads;

    if (file.password_hash !== null) {
      return NextResponse.json(
        { id: file.id, has_password: true, limit_reached: limitReached },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json({
      id: file.id,
      original_name: file.original_name,
      file_size: file.file_size,
      mime_type: file.mime_type,
      has_password: file.password_hash !== null,
      expires_at: file.expires_at,
      download_count: file.download_count,
      max_downloads: file.max_downloads,
      limit_reached: limitReached,
    });
  } catch (err) {
    console.error(`[GET /api/share/[id]] error (${errorCode(err)})`);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}

// ── POST /api/share/[id]  —  actual file download ────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const { id } = params;

  cleanExpiredFiles().catch(() => {});

  if (!id || typeof id !== "string" || id.length > 20) {
    return NextResponse.json({ error: "Invalid file ID." }, { status: 400 });
  }

  const now = Math.floor(Date.now() / 1000);

  let file;
  try {
    file = await getSharedFile(id);
  } catch (err) {
    console.error(`[POST /api/share/[id]] DB error (${errorCode(err)})`);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }

  if (!file) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  if (file.expires_at < now) {
    // Expiry wins: delete now. A download already in flight keeps reading
    // from its open handle (Node opens files with share-delete on Windows).
    await deleteSharedFile(id);
    return NextResponse.json({ error: "File has expired." }, { status: 410 });
  }

  // Max download check. No deletion here: the slots may be held by
  // downloads still in flight, which are refunded if they get aborted. The
  // file is deleted when the last allowed download completes.
  if (file.max_downloads !== null && file.download_count >= file.max_downloads) {
    return NextResponse.json({ error: "Download limit reached." }, { status: 410 });
  }

  // Password check. Wrong passwords are limited per client IP and share
  // (lib/share/password-attempts.ts); a missing password (401) is not counted.
  if (file.password_hash !== null) {
    const ip = getClientIp(req.headers);
    const retryAfter = passwordRetryAfterSeconds(ip, id);
    if (retryAfter > 0) {
      return NextResponse.json(
        { error: "Too many incorrect passwords. Try again later." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    let bodyPassword = "";
    try {
      const body = await req.json() as { password?: string };
      bodyPassword = body.password ?? "";
    } catch {
      // no body or not JSON — treat as no password
    }

    if (!bodyPassword.trim()) {
      return NextResponse.json({ error: "Password required." }, { status: 401 });
    }

    const valid = await bcrypt.compare(bodyPassword.trim(), file.password_hash);
    if (!valid) {
      recordFailedPassword(ip, id);
      return NextResponse.json({ error: "Incorrect password." }, { status: 403 });
    }
    clearFailedPasswords(ip, id);
  }

  // Open and check the stored file BEFORE reserving a download, so a file
  // that cannot be read never consumes one of the allowed downloads. The
  // open handle is then streamed, so the file checked is the file served.
  let handle: FileHandle;
  try {
    handle = await fsp.open(file.stored_path, "r");
  } catch (err) {
    if (errorCode(err) === "ENOENT") {
      await deleteSharedFile(id);
      return NextResponse.json({ error: "File no longer exists on disk." }, { status: 410 });
    }
    console.error(`[POST /api/share/[id]] read error (${errorCode(err)})`);
    return NextResponse.json({ error: "Failed to read file." }, { status: 500 });
  }

  let size: number;
  try {
    const st = await handle.stat();
    if (!st.isFile()) {
      const err = new Error("not a regular file") as NodeJS.ErrnoException;
      err.code = "EISDIR";
      throw err;
    }
    size = st.size;
  } catch (err) {
    await handle.close().catch(() => {});
    console.error(`[POST /api/share/[id]] read error (${errorCode(err)})`);
    return NextResponse.json({ error: "Failed to read file." }, { status: 500 });
  }

  // Reserve this download atomically (single conditional UPDATE). The
  // in-flight lease is taken first so a concurrent completion cannot delete
  // the file between this claim and the start of this stream.
  const lease = acquireDownloadLease(id);
  let claim;
  try {
    claim = await claimDownload(id, now);
  } catch (err) {
    lease.release();
    await handle.close().catch(() => {});
    console.error(`[POST /api/share/[id]] DB error (${errorCode(err)})`);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
  if (!claim) {
    lease.release();
    await handle.close().catch(() => {});
    return NextResponse.json({ error: "Download limit reached." }, { status: 410 });
  }

  // The slot only counts once the whole file has been read by the response.
  // Aborted downloads get their slot back; the file is removed when the last
  // allowed download completes and no other download is still running.
  const body = createTrackedDownloadStream({
    handle,
    lease,
    onAbort: () => refundDownload(id),
    onComplete: async () => {
      if (claim.max_downloads === null) return;
      const row = await getSharedFile(id);
      if (
        row &&
        row.max_downloads !== null &&
        row.download_count >= row.max_downloads &&
        activeDownloads(id) === 0
      ) {
        await deleteSharedFile(id);
      }
    },
  });

  const encodedName = encodeURIComponent(file.original_name).replace(
    /['()]/g,
    (c) => ({ "'": "%27", "(": "%28", ")": "%29" }[c] ?? c)
  );

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": file.mime_type ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodedName}`,
      "Content-Length": String(size),
      "Cache-Control": "no-store",
    },
  });
}
