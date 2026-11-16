/**
 * Short, non-identifying description of an error for server logs.
 * Returns the Node/SQLite error code (ENOENT, SQLITE_BUSY, …) or the error
 * class name — never the message, which for fs errors contains file paths
 * (and therefore share IDs and file names).
 */
export function errorCode(err: unknown): string {
  if (err && typeof err === "object" && "code" in err && typeof err.code === "string") {
    return err.code;
  }
  if (err instanceof Error) return err.name;
  return "unknown";
}
