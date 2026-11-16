/**
 * SQLite database layer for URL shortener.
 * Uses @libsql/client with a local file: URL.
 * This file must ONLY be imported from API routes (server-side).
 */

import { createClient } from "@libsql/client";
import path from "path";
import fs from "fs";
import { errorCode } from "@/lib/utils/error-code";

const DB_DIR  = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "shortener.db");

fs.mkdirSync(DB_DIR, { recursive: true });

const client = createClient({
  url: `file:${DB_PATH}`,
});

// ── Schema bootstrap ──────────────────────────────────────────────────────────

async function initDb(): Promise<void> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS short_urls (
      id          TEXT    PRIMARY KEY,
      original_url TEXT   NOT NULL,
      created_at  INTEGER DEFAULT (strftime('%s', 'now')),
      click_count INTEGER DEFAULT 0,
      expires_at  INTEGER
    )
  `);
  await client.execute(
    "CREATE INDEX IF NOT EXISTS idx_short_urls_expires_at ON short_urls(expires_at)"
  );
}

initDb().catch((err) =>
  console.error(`[shortener/db] schema initialisation failed (${errorCode(err)})`)
);

// ── Public types ──────────────────────────────────────────────────────────────

export interface ShortUrlRecord {
  id: string;
  original_url: string;
  created_at: number;
  click_count: number;
  expires_at: number | null;
}

// ── CRUD functions ────────────────────────────────────────────────────────────

/**
 * Insert a new short URL. Returns the generated ID.
 */
export async function createShortUrl(
  originalUrl: string,
  expiresAt?: number | null
): Promise<string> {
  const { nanoid } = await import("nanoid");

  // Collision-safe ID generation: retry up to 5 times
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = nanoid(6);

    // Check for collision
    const existing = await client.execute({
      sql:  "SELECT id FROM short_urls WHERE id = ?",
      args: [id],
    });

    if (existing.rows.length === 0) {
      await client.execute({
        sql:  "INSERT INTO short_urls (id, original_url, expires_at) VALUES (?, ?, ?)",
        args: [id, originalUrl, expiresAt ?? null],
      });
      return id;
    }
  }

  throw new Error("Failed to generate unique short URL ID after 5 attempts");
}

/**
 * Fetch a short URL record by ID.
 * Returns null if not found.
 */
export async function getShortUrl(id: string): Promise<ShortUrlRecord | null> {
  const result = await client.execute({
    sql:  "SELECT * FROM short_urls WHERE id = ?",
    args: [id],
  });

  if (!result.rows.length) return null;

  const row = result.rows[0];
  return {
    id:           row.id           as string,
    original_url: row.original_url as string,
    created_at:   row.created_at   as number,
    click_count:  row.click_count  as number,
    expires_at:   row.expires_at   as number | null,
  };
}

/**
 * Increment the click counter for a short URL.
 */
export async function incrementClick(id: string): Promise<void> {
  await client.execute({
    sql:  "UPDATE short_urls SET click_count = click_count + 1 WHERE id = ?",
    args: [id],
  });
}

/**
 * Delete all expired short URLs. Safe to call on every request.
 */
export async function cleanExpiredUrls(): Promise<void> {
  await client.execute(
    "DELETE FROM short_urls WHERE expires_at IS NOT NULL AND expires_at < strftime('%s', 'now')"
  );
}
