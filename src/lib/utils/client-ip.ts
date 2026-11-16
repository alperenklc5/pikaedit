/**
 * Client IP for rate limiting behind nginx.
 *
 * nginx sets `X-Real-IP $remote_addr`, which the client cannot forge, so it
 * wins. Without it, the LAST X-Forwarded-For entry is used: that is the one
 * appended by the nearest proxy. The first entry is whatever the client sent
 * and must never be trusted for rate limiting.
 */
export function getClientIp(headers: Headers): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;

  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return "unknown";
}
