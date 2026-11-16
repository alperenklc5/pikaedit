/**
 * Next.js instrumentation hook — runs once when the server process starts.
 * Starts the scheduled cleanup of expired data (Node.js runtime only; the
 * edge runtime has no filesystem or SQLite access).
 *
 * The import must stay inside the NEXT_RUNTIME check (not after an early
 * return) so webpack drops it from the edge bundle. `next build` also calls
 * register() in its page-data workers; the NEXT_PHASE check keeps those from
 * opening the SQLite files concurrently.
 */
export async function register(): Promise<void> {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    const { startCleanupScheduler } = await import("./lib/cleanup");
    startCleanupScheduler();
  }
}
