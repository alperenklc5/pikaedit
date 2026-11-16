/**
 * Download tracking for shared files (server-only).
 *
 * A download reserves one slot in the DB (claimDownload) before streaming.
 * The slot is only kept if the stream is read to the end; if the client
 * aborts, the slot is refunded. The file is deleted only after the last
 * allowed download has COMPLETED and no other download of the same file is
 * still in flight.
 *
 * In-flight downloads are counted per process on globalThis. This assumes
 * the app runs as a single Node.js process (e.g. pm2 fork mode, no cluster):
 * with several processes each one would keep its own count.
 */

import type { FileHandle } from "fs/promises";
import { errorCode } from "@/lib/utils/error-code";

const CHUNK_SIZE = 64 * 1024;

/**
 * If the consumer stops pulling for this long without cancelling, the
 * download is treated as aborted (backstop so a handle can never leak).
 */
const IDLE_TIMEOUT_MS = 2 * 60 * 1000;

const g = globalThis as unknown as { __pikaShareInflight?: Map<string, number> };

function inflight(): Map<string, number> {
  if (!g.__pikaShareInflight) g.__pikaShareInflight = new Map();
  return g.__pikaShareInflight;
}

/** Number of downloads of this file currently holding a lease. */
export function activeDownloads(id: string): number {
  return inflight().get(id) ?? 0;
}

export interface DownloadLease {
  /** Idempotent: releases the in-flight slot once. */
  release(): void;
}

/**
 * Register an in-flight download. Must be taken BEFORE claimDownload so a
 * concurrent completion never sees "limit reached and nobody in flight"
 * between this request's claim and the start of its stream.
 */
export function acquireDownloadLease(id: string): DownloadLease {
  const map = inflight();
  map.set(id, (map.get(id) ?? 0) + 1);
  let released = false;
  return {
    release(): void {
      if (released) return;
      released = true;
      const n = (map.get(id) ?? 1) - 1;
      if (n <= 0) map.delete(id);
      else map.set(id, n);
    },
  };
}

export interface TrackedDownloadOptions {
  handle: FileHandle;
  lease: DownloadLease;
  /** Called after the whole file was handed to the response and the handle is closed. */
  onComplete: () => Promise<void>;
  /** Called when the client aborted / the read failed, after the handle is closed. */
  onAbort: () => Promise<void>;
}

/**
 * Pull-based stream over an open file handle.
 *
 * highWaterMark 0: a chunk is only read when the response asks for one, so
 * end-of-file is reached only after the previous (last) chunk was taken by
 * the response writer — that is when the download counts as complete.
 * cancel() (client disconnect), a read error or the idle timeout count as
 * an abort. In every case the handle is closed exactly once, before the
 * callback runs (Windows cannot delete an open file).
 */
export function createTrackedDownloadStream(
  opts: TrackedDownloadOptions
): ReadableStream<Uint8Array> {
  const { handle, lease, onComplete, onAbort } = opts;
  let settled = false;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;

  const finish = async (completed: boolean): Promise<void> => {
    if (settled) return;
    settled = true;
    if (idleTimer) clearTimeout(idleTimer);
    await handle.close().catch(() => {});
    lease.release();
    try {
      await (completed ? onComplete() : onAbort());
    } catch (err) {
      console.error(
        `[share/download] ${completed ? "completion" : "refund"} failed (${errorCode(err)})`
      );
    }
  };

  const armIdleTimer = (): void => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      try {
        controllerRef?.error(new Error("download idle timeout"));
      } catch {
        /* already closed */
      }
      void finish(false);
    }, IDLE_TIMEOUT_MS);
    idleTimer.unref?.();
  };

  return new ReadableStream<Uint8Array>(
    {
      start(controller): void {
        controllerRef = controller;
        armIdleTimer();
      },
      async pull(controller): Promise<void> {
        if (settled) return;
        armIdleTimer();
        try {
          const buf = Buffer.allocUnsafe(CHUNK_SIZE);
          const { bytesRead } = await handle.read(buf, 0, CHUNK_SIZE, null);
          // The client may have aborted (cancel → handle closed) while this
          // read was pending; then there is nothing left to do.
          if (settled) return;
          if (bytesRead === 0) {
            controller.close();
            await finish(true);
            return;
          }
          controller.enqueue(new Uint8Array(buf.buffer, buf.byteOffset, bytesRead));
        } catch (err) {
          if (settled) return; // read raced with cancel(): not a real read error
          console.error(`[share/download] read error (${errorCode(err)})`);
          try {
            controller.error(err);
          } catch {
            /* already closed */
          }
          await finish(false);
        }
      },
      async cancel(): Promise<void> {
        await finish(false);
      },
    },
    { highWaterMark: 0 }
  );
}
