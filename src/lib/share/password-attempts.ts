/**
 * Failed-password limiter for password-protected shares (server-only).
 *
 * Only wrong passwords (403) count. The key is client IP + share ID, so one
 * visitor guessing one share cannot lock out other visitors or other shares.
 * A correct password clears the key. State lives in memory of this process
 * (same single-process assumption as the upload rate limiter) and is lost
 * on restart.
 */

/** Wrong passwords allowed per IP and share within one window. */
export const MAX_FAILED_PASSWORD_ATTEMPTS = 10;

/** Window length; it starts at the first wrong password. */
export const PASSWORD_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

/** Upper bound on tracked IP+share keys, so the map cannot grow without limit. */
export const MAX_TRACKED_PASSWORD_KEYS = 10_000;

interface AttemptEntry {
  failures: number;
  resetAt: number;
}

const g = globalThis as unknown as { __pikaSharePasswordAttempts?: Map<string, AttemptEntry> };

function attempts(): Map<string, AttemptEntry> {
  if (!g.__pikaSharePasswordAttempts) g.__pikaSharePasswordAttempts = new Map();
  return g.__pikaSharePasswordAttempts;
}

function keyOf(ip: string, shareId: string): string {
  return `${ip}\u0000${shareId}`;
}

/** Drop expired entries; if still over the cap, drop the oldest ones. */
function sweep(map: Map<string, AttemptEntry>, now: number): void {
  for (const [k, v] of Array.from(map.entries())) {
    if (now >= v.resetAt) map.delete(k);
  }
  // Map iterates in insertion order: the first keys are the oldest.
  for (const k of Array.from(map.keys())) {
    if (map.size < MAX_TRACKED_PASSWORD_KEYS) break;
    map.delete(k);
  }
}

/**
 * Seconds until this IP may try this share again, or 0 when it may try now.
 * Call before verifying the password.
 */
export function passwordRetryAfterSeconds(ip: string, shareId: string, now: number = Date.now()): number {
  const map = attempts();
  const entry = map.get(keyOf(ip, shareId));
  if (!entry) return 0;
  if (now >= entry.resetAt) {
    map.delete(keyOf(ip, shareId));
    return 0;
  }
  if (entry.failures < MAX_FAILED_PASSWORD_ATTEMPTS) return 0;
  return Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
}

/** Record one wrong password. */
export function recordFailedPassword(ip: string, shareId: string, now: number = Date.now()): void {
  const map = attempts();
  const key = keyOf(ip, shareId);
  const entry = map.get(key);
  if (entry && now < entry.resetAt) {
    entry.failures += 1;
    return;
  }
  if (map.size >= MAX_TRACKED_PASSWORD_KEYS) sweep(map, now);
  map.delete(key);
  map.set(key, { failures: 1, resetAt: now + PASSWORD_ATTEMPT_WINDOW_MS });
}

/** A correct password clears the failures for this IP and share. */
export function clearFailedPasswords(ip: string, shareId: string): void {
  attempts().delete(keyOf(ip, shareId));
}

/** Number of tracked keys (for tests and monitoring). */
export function trackedPasswordKeys(): number {
  return attempts().size;
}
