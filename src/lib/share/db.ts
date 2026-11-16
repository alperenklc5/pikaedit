/**
 * SQLite database layer for temporary file sharing.
 * Uses @libsql/client — same approach as notes/db.ts.
 * This file must ONLY be imported from API routes (server-side).
 */

import { createClient } from "@libsql/client";
import path from "path";
import fs from "fs";
import { errorCode } from "@/lib/utils/error-code";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "share.db");

fs.mkdirSync(DB_DIR, { recursive: true });

// Ensure upload directory exists
const UPLOAD_DIR = path.join(process.cwd(), "data", "shared");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const client = createClient({ url: `file:${DB_PATH}` });

// ── Schema bootstrap ─────────────────────────────────────────────────────────

async function initDb(): Promise<void> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS shared_files (
      id              TEXT    PRIMARY KEY,
      original_name   TEXT    NOT NULL,
      stored_path     TEXT    NOT NULL,
      file_size       INTEGER NOT NULL,
      mime_type       TEXT,
      password_hash   TEXT,
      expires_at      INTEGER NOT NULL,
      created_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      download_count  INTEGER NOT NULL DEFAULT 0,
      max_downloads   INTEGER
    )
  `);
  await client.execute(
    "CREATE INDEX IF NOT EXISTS idx_shared_expires ON shared_files(expires_at)"
  );
}

initDb().catch((err) =>
  console.error(`[share/db] schema initialisation failed (${errorCode(err)})`)
);

// ── Types ────────────────────────────────────────────────────────────────────

export interface SharedFileRecord {
  id: string;
  original_name: string;
  stored_path: string;
  file_size: number;
  mime_type: string | null;
  password_hash: string | null;
  expires_at: number;
  created_at: number;
  download_count: number;
  max_downloads: number | null;
}

export interface CreateSharedFileInput {
  id: string;
  original_name: string;
  stored_path: string;
  file_size: number;
  mime_type: string | null;
  password_hash: string | null;
  expires_at: number;
  max_downloads: number | null;
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function createSharedFile(input: CreateSharedFileInput): Promise<void> {
  await client.execute({
    sql: `INSERT INTO shared_files
            (id, original_name, stored_path, file_size, mime_type, password_hash, expires_at, max_downloads)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      input.id,
      input.original_name,
      input.stored_path,
      input.file_size,
      input.mime_type,
      input.password_hash,
      input.expires_at,
      input.max_downloads,
    ],
  });
}

export async function getSharedFile(id: string): Promise<SharedFileRecord | null> {
  const result = await client.execute({
    sql: "SELECT * FROM shared_files WHERE id = ?",
    args: [id],
  });
  if (!result.rows.length) return null;
  const row = result.rows[0];
  return {
    id:             row.id             as string,
    original_name:  row.original_name  as string,
    stored_path:    row.stored_path    as string,
    file_size:      row.file_size      as number,
    mime_type:      row.mime_type      as string | null,
    password_hash:  row.password_hash  as string | null,
    expires_at:     row.expires_at     as number,
    created_at:     row.created_at     as number,
    download_count: row.download_count as number,
    max_downloads:  row.max_downloads  as number | null,
  };
}

/** Upper bound accepted for max_downloads (the UI offers 1, 5 and 10). */
export const MAX_DOWNLOADS_LIMIT = 100;

export interface DownloadClaim {
  download_count: number;
  max_downloads: number | null;
}

/**
 * Atomically reserve one download: the check and the counter increment are a
 * single conditional UPDATE, so concurrent requests can never exceed
 * max_downloads. The follow-up SELECT runs in the same write transaction, so
 * it sees exactly the count this request produced.
 * Returns null when nothing was updated (missing, expired or limit reached).
 *
 * Note: no `RETURNING` here — @libsql/client reports rowsAffected = 0 for
 * UPDATE ... RETURNING, which would make every claim look failed.
 */
export async function claimDownload(id: string, now: number): Promise<DownloadClaim | null> {
  const [update, select] = await client.batch(
    [
      {
        sql: `UPDATE shared_files
                 SET download_count = download_count + 1
               WHERE id = ?
                 AND expires_at >= ?
                 AND (max_downloads IS NULL OR download_count < max_downloads)`,
        args: [id, now],
      },
      {
        sql: "SELECT download_count, max_downloads FROM shared_files WHERE id = ?",
        args: [id],
      },
    ],
    "write"
  );
  if (update.rowsAffected !== 1 || !select.rows.length) return null;
  const row = select.rows[0];
  return {
    download_count: row.download_count as number,
    max_downloads: row.max_downloads as number | null,
  };
}

/**
 * Give back a download slot reserved by claimDownload when the download did
 * not complete (client aborted, read failed). Single UPDATE; never below 0.
 */
export async function refundDownload(id: string): Promise<void> {
  await client.execute({
    sql: `UPDATE shared_files
             SET download_count = download_count - 1
           WHERE id = ? AND download_count > 0`,
    args: [id],
  });
}

export async function deleteSharedFile(id: string): Promise<void> {
  // First get the stored_path so we can delete the file from disk too
  const rec = await getSharedFile(id);
  if (rec) {
    try {
      if (fs.existsSync(rec.stored_path)) fs.unlinkSync(rec.stored_path);
    } catch {
      // ignore disk errors — DB cleanup still proceeds
    }
  }
  await client.execute({ sql: "DELETE FROM shared_files WHERE id = ?", args: [id] });
}

/**
 * Delete all expired files from both disk and DB.
 * A row is removed only after its file is gone (or was already missing), so a
 * failed unlink never leaves an orphan file without a DB row; it is retried on
 * the next run and the error is re-thrown for the caller to log.
 */
export async function cleanExpiredFiles(): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const expired = await client.execute({
    sql: "SELECT id, stored_path FROM shared_files WHERE expires_at < ?",
    args: [now],
  });

  let firstError: unknown = null;
  for (const row of expired.rows) {
    try {
      fs.unlinkSync(row.stored_path as string);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        firstError ??= err;
        continue;
      }
    }
    await client.execute({
      sql: "DELETE FROM shared_files WHERE id = ?",
      args: [row.id as string],
    });
  }
  if (firstError) throw firstError;
}
