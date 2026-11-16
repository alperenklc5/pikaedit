/**
 * Single source of truth for file-extension rules on every upload path.
 * Pure module: safe to import from client components and API routes.
 *
 * All extensions are lowercase and include the leading dot.
 */

/**
 * Executables and scripts that the file-sharing tool refuses (client check
 * for fast feedback, server check for enforcement). Keep the share guides
 * (src/content/guides/{tr,en}/share.ts) in sync when changing this list.
 */
export const SHARE_BLOCKED_EXTENSIONS: ReadonlySet<string> = new Set([
  ".exe", ".bat", ".sh", ".msi", ".cmd", ".scr",
  ".ps1", ".vbs", ".js", ".jar", ".com", ".pif",
]);

/** Video inputs accepted by the server-side compress and video-to-GIF jobs. */
export const VIDEO_JOB_EXTENSIONS: readonly string[] = [
  ".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v",
];

/** Video inputs accepted by the server-side video-to-MP3 job. */
export const VIDEO_TO_MP3_EXTENSIONS: readonly string[] = [
  ...VIDEO_JOB_EXTENSIONS, ".wmv", ".flv", ".3gp",
];

/** Audio/video inputs accepted by the auto-subtitle route. */
export const SUBTITLE_EXTENSIONS: ReadonlySet<string> = new Set([
  ".mp4", ".webm", ".mov",
  ".mp3", ".wav", ".m4a", ".aac",
  ".ogg", ".flac",
]);

/** Audio inputs accepted by stem separation (others are stored as .mp3). */
export const STEM_AUDIO_EXTENSIONS: readonly string[] = [
  ".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac",
];

/**
 * Lowercase extension with leading dot, or "" when there is none.
 * Trailing dots and whitespace are ignored ("x.exe." and "x.exe " give
 * ".exe": Windows drops them when saving), and dotfiles such as ".bashrc"
 * have no extension (same as Node's path.extname).
 */
export function getExtension(fileName: string): string {
  const cleaned = fileName.trim().replace(/[.\s]+$/, "").toLowerCase();
  const slash = Math.max(cleaned.lastIndexOf("/"), cleaned.lastIndexOf("\\"));
  const base = cleaned.slice(slash + 1);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot);
}
