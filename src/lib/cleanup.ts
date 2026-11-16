// Simplified for this repository: the live site runs this scheduler with two
// more tasks, expired encrypted notes and server-side video job files. Only
// the share, shortener and data/temp tasks are kept; the interval, the
// temp-file age and the error handling are unchanged.
/**
 * Scheduled cleanup of expired server-side data.
 *
 * Runs independently of traffic (started from src/instrumentation.ts) so that
 * expired shares and short URLs are removed even when nobody hits the related
 * API routes.
 *
 * Server-only: imports DB modules and the filesystem.
 */

import { readdir, rm, stat } from "fs/promises";
import { join } from "path";
import { cleanExpiredFiles } from "@/lib/share/db";
import { cleanExpiredUrls } from "@/lib/shortener/db";
import { errorCode } from "@/lib/utils/error-code";

/** How often the cleanup runs. Override with CLEANUP_INTERVAL_MS (tests). */
export const CLEANUP_INTERVAL_MS: number =
  Number(process.env.CLEANUP_INTERVAL_MS) || 5 * 60 * 1000;

/**
 * Max age of files in data/temp. In this repository only partial share
 * uploads (share-<id>.part) are written there. A file is removed once its
 * mtime is older than this; an upload that is still receiving data keeps
 * updating its mtime.
 */
export const TEMP_MAX_AGE_MS: number =
  Number(process.env.CLEANUP_TEMP_MAX_AGE_MS) || 30 * 60 * 1000;

const TEMP_DIR = join(process.cwd(), "data", "temp");

async function cleanStaleTemp(now: number): Promise<void> {
  let names: string[];
  try {
    names = await readdir(TEMP_DIR);
  } catch (err) {
    if (errorCode(err) === "ENOENT") return;
    throw err;
  }
  for (const name of names) {
    // Skip dotfiles (the live site keeps a lock file here).
    if (name.startsWith(".")) continue;
    const p = join(TEMP_DIR, name);
    try {
      const st = await stat(p);
      if (now - st.mtimeMs > TEMP_MAX_AGE_MS) {
        await rm(p, { recursive: true, force: true });
      }
    } catch (err) {
      if (errorCode(err) !== "ENOENT") throw err;
    }
  }
}

const TASKS: ReadonlyArray<{ name: string; run: (now: number) => Promise<void> }> = [
  { name: "share", run: () => cleanExpiredFiles() },
  { name: "shortener", run: () => cleanExpiredUrls() },
  { name: "temp", run: (now) => cleanStaleTemp(now) },
];

/**
 * Run every cleanup task once. A failing task does not stop the others; each
 * failure is logged with a generic message (no IDs, no paths).
 */
export async function runCleanup(): Promise<void> {
  const now = Date.now();
  for (const task of TASKS) {
    try {
      await task.run(now);
    } catch (err) {
      console.error(`[cleanup] ${task.name} cleanup failed (${errorCode(err)})`);
    }
  }
}

interface CleanupState {
  timer?: ReturnType<typeof setInterval>;
  running: boolean;
}

const g = globalThis as unknown as { __pikaCleanup?: CleanupState };

/**
 * Start the periodic cleanup. Safe to call more than once: a globalThis guard
 * makes sure only one interval exists per process (dev reloads, double
 * register()).
 */
export function startCleanupScheduler(): void {
  if (g.__pikaCleanup?.timer) return;
  const state: CleanupState = g.__pikaCleanup ?? { running: false };
  g.__pikaCleanup = state;

  const tick = (): void => {
    if (state.running) return; // previous run still busy — skip this tick
    state.running = true;
    runCleanup()
      .catch(() => {
        console.error("[cleanup] unexpected failure");
      })
      .finally(() => {
        state.running = false;
      });
  };

  state.timer = setInterval(tick, CLEANUP_INTERVAL_MS);
  state.timer.unref?.();
  tick();
}
