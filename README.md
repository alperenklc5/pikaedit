# pikaedit-share

The File Share and URL Shortener tools from [pikaedit.com](https://pikaedit.com),
published as a reference implementation. Next.js 14 (App Router), SQLite via
`@libsql/client`, Turkish and English UI.

[Türkçe özet](README.tr.md)

## What this is

- The real code of two tools that run on pikaedit.com:
  - **File Share** — upload a file, get a temporary link (`/<locale>/share`,
    download page `/<locale>/s/<id>`).
  - **URL Shortener** — shorten an http/https URL (`/<locale>/developer/url-shortener`,
    redirect `/go/<code>`).
- 33 files are byte-for-byte copies of the files the live site runs (API routes,
  database layer, download tracking, password-attempt limiter, cleanup
  scheduler, pages, configs).
- It builds and runs on its own: `npm ci && npm run build && npm start`.

## What this is not

- Not the full pikaedit.com site. The site shell is left out: navbar, footer,
  command palette, guides, the home page's tool directory and the other 40+
  tools (PDF, image, video, notes, …). The live site runs a superset of this
  code.
- Not a hosted service, not an SDK, and not audited by a third party.

### Files that differ from the live site

Each of these starts with a `Simplified for this repository:` comment that says
what the live site renders instead.

| File | Live site | Here |
|---|---|---|
| `src/app/[locale]/layout.tsx` | Navbar, footer, Inter / JetBrains Mono fonts | i18n provider and global styles only |
| `src/app/[locale]/page.tsx` | Home page with the full tool directory | Two links (File Share, URL Shortener), so `/` and `/<locale>` do not 404 |
| `src/components/tools/ToolLayout.tsx` | Breadcrumbs, privacy badge from the site navigation, related tools, related guide | Same props; renders title, description, the server-processing sentence, the tool, steps and FAQ. Breadcrumbs are accepted but not rendered (their category pages are not in this repository) |
| `src/components/tools/ToolGuideBox.tsx` | Link to the tool's guide | Renders nothing |
| `src/lib/cleanup.ts` | Also cleans expired encrypted notes and video job files | Share, shortener and `data/temp` tasks only; interval and error handling unchanged |
| `src/middleware.ts` | Also redirects EN URLs of TR-only guides and a retired video URL | next-intl locale routing only; matcher and `localePrefix` unchanged |
| `next.config.js` | Also aliases `canvas` for the Monaco editor | Alias removed; `images.unoptimized` and `instrumentationHook` kept |
| `src/messages/{tr,en}.json` | All site strings | The 107 keys these pages use (`npm run check-messages`) |

## Features

**File Share**
- Upload one file up to 500 MB. Executables and scripts are refused (list below).
- Expiry: 30 minutes, 1 hour, 24 hours (default), 3 days or 7 days.
- Optional password. Optional download limit: the UI offers 1, 5 or 10; the API
  accepts any integer from 1 to 100.
- Link `/<locale>/s/<id>` plus a QR code generated in the browser.

**URL Shortener**
- http and https URLs up to 2048 characters; URLs pointing to the site's own
  host are refused.
- Expiry: never (default), 7 days, 30 days or 1 year.
- `/go/<code>` redirects with 307. A click counter is stored (returned by
  `GET /api/shorten/<code>`, not shown in the UI). QR code generated in the browser.

## How it works

```
File Share — upload
  browser ──POST /api/share (raw body, application/octet-stream;
           │                  X-File-Name, X-File-Type, X-Expiry,
           │                  X-Share-Password, X-Max-Downloads headers)
           ▼
  rate limit (per IP, in memory) → disk check → validate headers / extension
           ▼
  stream body → data/temp/share-<id>.part  (byte counter, 413 above 500 MB)
           ▼
  rename → data/shared/<id>_<safe-name>; bcrypt the password; row in data/share.db
           ▼
  201 { id, url: "/s/<id>", expiresAt }

File Share — download
  GET  /api/share/<id>   metadata (only {id, has_password, limit_reached}
                         when a password is set)
  POST /api/share/<id>   expiry check → password check (429 after 10 wrong
                         passwords per IP and share in 10 minutes)
                         → open the file
                         → reserve one download (single conditional UPDATE)
                         → stream the file in 64 KB chunks
           ├─ stream read to the end → keep the slot; if it was the last one
           │                           and no other download is running,
           │                           delete file + row
           └─ client aborts / read error / 2 min idle → give the slot back

URL Shortener
  POST /api/shorten  → validate URL → row in data/shortener.db → { shortUrl }
  GET  /go/<code>    → 307 to the target, Cache-Control: no-store
                       (302 to the tool page with ?error=notfound|expired)

Every 5 minutes (src/instrumentation.ts → src/lib/cleanup.ts):
  delete expired shares (file first, then row), expired short URLs,
  files in data/temp older than 30 minutes
```

## Data and privacy facts

Every line below is taken from the code in this repository (`file:line`).

| Topic | Behaviour | Source |
|---|---|---|
| Upload size | 500 MB maximum; 413 when the declared or the streamed size exceeds it | `src/app/api/share/route.ts:17` |
| Upload format | Raw body only; multipart gets 415 | `src/app/api/share/route.ts:128` |
| Where files live | `data/shared/` (complete), `data/temp/` (in progress); metadata in `data/share.db` | `src/app/api/share/route.ts:18-19`, `src/lib/share/db.ts:13` |
| **Files are not encrypted** | Files are written to disk as uploaded. The original file name is stored in plain text in SQLite | `src/app/api/share/route.ts:215-234` |
| Share expiry | 30 min to 7 days, counted from the end of the upload; unknown values fall back to 24 h | `src/app/api/share/route.ts:39-43,170,248` |
| Password | bcrypt, cost 10, max 200 characters. It only restricts downloading; it does not encrypt the file | `src/app/api/share/route.ts:173,244` |
| Password-protected metadata | Without the password the API returns only `{id, has_password, limit_reached}`; missing / wrong password → 401 / 403 | `src/app/api/share/[id]/route.ts:62,147,153` |
| Wrong-password limit | Per client IP **and** share: after 10 wrong passwords within a 10-minute window (starting at the first wrong one) the endpoint answers 429 with `Retry-After` until the window ends, also for the correct password. A correct password clears the counter; a missing password (401) is not counted; no download slot is used. In memory, at most 10,000 tracked IP+share pairs (expired ones dropped first, then the oldest) | `src/lib/share/password-attempts.ts:12,15,18,37-46`, `src/app/api/share/[id]/route.ts:130-134,152,155` |
| Download limit | 1–100; reservation is one conditional `UPDATE … WHERE download_count < max_downloads` | `src/lib/share/db.ts:117,142` |
| Interrupted download | The slot is returned with `download_count = download_count - 1 WHERE download_count > 0`; the file stays | `src/lib/share/db.ts:167-168`, `src/app/api/share/[id]/route.ts:213` |
| Deletion after the last download | Only when the last allowed download completed and no other download of that file is running | `src/app/api/share/[id]/route.ts:221` |
| Completion | A download counts as complete when the server has handed the last 64 KB chunk to the response; idle for 2 minutes counts as aborted | `src/lib/share/download.ts:18,24,154` |
| Short URL expiry | never / 7 d / 30 d / 1 y | `src/app/api/shorten/route.ts:42-45` |
| `/go` redirect | 307 to the target, `Cache-Control: no-store`; 302 to the tool page when not found or expired | `src/app/go/[code]/route.ts:13-16,34-59` |
| Cleanup timing | Runs every 5 minutes (also once at start-up, not during `next build`). An expired share or link is refused immediately by the API; its data is deleted by the next cleanup run (or by the first request that finds it expired) | `src/lib/cleanup.ts:23,60-62`, `src/instrumentation.ts:14` |
| Temp files | Files in `data/temp` whose mtime is older than 30 minutes are removed | `src/lib/cleanup.ts:32` |
| IP addresses | The app uses the client IP only as a key in in-memory rate-limit maps (lost on restart). It does not write IPs to its database or to its own log output. A reverse proxy in front of it (e.g. the nginx access log) keeps separate logs that normally do record client IPs; configure and rotate those yourself | `src/app/api/share/route.ts:49-51`, `src/app/api/shorten/route.ts:15-16`, `src/lib/share/password-attempts.ts:25-30` |
| Which IP | `X-Real-IP` if present, otherwise the **last** `X-Forwarded-For` entry. The first XFF entry (client-controlled) is never used | `src/lib/utils/client-ip.ts:10,19` |
| Rate limits | Uploads: 5 per hour per IP. Short URLs: 10 per hour per IP. Wrong passwords: see above | `src/app/api/share/route.ts:50-51`, `src/app/api/shorten/route.ts:15-16` |
| App logs | Log lines written by this app's code contain a fixed message and an error code (e.g. `ENOENT`), never IP addresses, share IDs, file names, paths or error objects. This covers the app's own output only: Next.js and the reverse proxy (e.g. nginx access and error logs) write their own logs | e.g. `src/lib/share/db.ts:46`, `src/lib/shortener/db.ts:39` |
| Blocked extensions | `.exe .bat .sh .msi .cmd .scr .ps1 .vbs .js .jar .com .pif` (case-insensitive; trailing dots/spaces ignored, so `x.exe.` counts as `.exe`) → 422 | `src/lib/utils/upload-extensions.ts:14-15,47` |
| IDs | Shares: 8-character nanoid. Short links: 6-character nanoid, 5 attempts on collision | `src/app/api/share/route.ts:195`, `src/lib/shortener/db.ts:65` |
| Disk guard | Upload refused with 507 when the disk holding `data/shared` is 80 % full or more (uses `df`) | `src/app/api/share/route.ts:77,87,115` |
| Image optimizer | Disabled: `images.unoptimized: true`, so `/_next/image` answers 404 | `next.config.js:5-9` |

## Run it

Requirements: Node.js 20 or later (`engines` in `package.json`).
Tested on Node 20.20.2 (production) and 24.14.1 (development).

```bash
npm ci
cp .env.example .env.local      # set NEXT_PUBLIC_BASE_URL
npm run build
npm start                       # http://localhost:3000 → redirects to /tr
```

Environment variables (see `.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_BASE_URL` | `https://pikaedit.com` | Canonical URLs, the short links returned by the API, `/go` fallback pages. Set it, or short links will point to pikaedit.com |
| `CLEANUP_INTERVAL_MS` | `300000` | Cleanup interval |
| `CLEANUP_TEMP_MAX_AGE_MS` | `1800000` | Age after which files in `data/temp` are removed |

The `data/` directory is created under the working directory on first use and
holds `share.db`, `shortener.db`, `shared/` and `temp/`. Keep it on persistent
storage and out of version control (it is in `.gitignore`).

Other scripts: `npm run lint`, `npm run typecheck`, `npm run check-messages`
(TR/EN key parity and usage), `npm run third-party-licenses`.

## Deployment notes

- **Single process.** Rate limits, the wrong-password counter, the in-flight
  download counter and the cleanup timer live in memory of one Node.js
  process. Run one instance (e.g. pm2 in fork mode, not cluster). Several
  instances would each have their own limits and could delete a file another
  instance is still serving.
- **Reverse proxy.** The rate limiters trust `X-Real-IP`. Your proxy must set it
  (nginx: `proxy_set_header X-Real-IP $remote_addr;`) and the app must not be
  reachable directly, otherwise clients can set the header themselves.
  - Allow bodies slightly above 500 MB, e.g. nginx `client_max_body_size 512M;`
    (that is what the live site uses).
  - nginx's `proxy_read_timeout` / `proxy_send_timeout` apply between two
    successive reads/writes (default 60 s). Raise them if your clients upload or
    download slowly enough to stall for longer.
- **Disk guard.** The 80 % check runs `df`. On Windows `df` does not exist: the
  check is skipped and the shell prints "The system cannot find the path
  specified" to the server log on each upload.
- **HTTPS.** Passwords travel in a request header (upload) and a JSON body
  (download). Serve the app over HTTPS only.

## Known limitations

- Files are stored unencrypted on the server's disk; the password is an access
  check, not encryption.
- Wrong passwords are limited per IP and share only. Someone with many IP
  addresses can try more passwords; bcrypt (cost 10) is the remaining cost.
  `GET /api/share/<id>`, `GET /api/shorten/<code>`, `/go/<code>` and downloads of
  shares without a password are not rate-limited.
- Rate limits, the wrong-password counter and in-flight downloads are per
  process and reset on restart.
- A download is counted as complete when the server has written the last chunk
  to the response, not when the client confirms receipt. A client that drops
  during the final few chunks may still use up a slot.
- If the process restarts while a download is running, that download's slot is
  not given back.
- While a download that holds the last slot is running, other requests get
  `410 Download limit reached.`; the slot becomes available again if that
  download is aborted.
- There is no way to delete a share or a short link before it expires.
- On a fresh checkout `next build` may print
  `[share/db] schema initialisation failed (SQLITE_BUSY)` or the same line for
  `[shortener/db]`: several build workers open the new SQLite files at once.
  The schema is created again when the server starts.
- `/go` fallbacks for unknown or expired codes always go to the English tool page.
- UI languages: Turkish and English only.

## Security and reporting

- Bugs: GitHub Issues.
- Vulnerabilities: please use GitHub's private vulnerability reporting
  (Security tab → "Report a vulnerability") or e-mail contact@pikaedit.com.
  Do not open a public issue for security problems.

### Next.js 14.2.35 and known advisories

This repository pins `next@14.2.35`, the last 14.2.x release and the version the
[Next.js security update of 2025-12-11](https://nextjs.org/blog/security-update-2025-12-11)
names for 14.x. `npm audit --omit=dev` still lists advisories for it whose fixes
exist only in 15.5.x and later (3 critical, 9 high, 11 moderate, 2 low at the
time of writing). How they relate to this code:

| Advisory (high/critical) | Relevance here |
|---|---|
| GHSA-p293-qw3h-jr36 — RCE on Windows-hosted servers | Applies only if you host on Windows |
| GHSA-2xp9-vwfh-vxw4, GHSA-2464-fhr4-w9xw — RCE in the Image Optimization API (AVIF / SVG) | The image optimizer is disabled (`images.unoptimized: true`); `/_next/image` returns 404 before any parameter is read (Next.js `next-server.js`, `handleNextImageRequest`). Verified with SVG, remote-URL and empty requests |
| GHSA-h25m-26qc-wcjf, GHSA-q4gf-8mx6-v5v3, GHSA-8h8q-6873-q5fj — DoS with Server Components | The app uses the App Router; treat these as applicable |
| GHSA-m99w-x7hq-7vfj, GHSA-p3m5-59mp-jv5r — DoS using Server Actions; GHSA-89xv-2m56-2m9x — SSRF in Server Actions on custom servers | The app defines no Server Actions and uses `next start`, not a custom server; not verified beyond that |
| GHSA-p9j2-gv94-2wf4 — SSRF in rewrites | No rewrites are configured |
| GHSA-36qx-fr4f-26g5 — middleware bypass in Pages Router with i18n | No Pages Router |
| GHSA-c4j6-fc7j-m34r — SSRF with WebSocket upgrades | No WebSocket handling in this code; not verified beyond that |

Other runtime findings:

- `next-intl@3.26.5`, GHSA-8f24-v5vv-gm5j (open redirect, moderate). Affected
  range `< 4.9.1`; the only fix is 4.9.1 (no 3.x release). The advisory concerns
  `localePrefix: "as-needed"`. This code uses `"always"`
  (`src/middleware.ts:15`). Tested against `next start`: 20 redirect probes
  (`//host`, backslashes, encoded slashes and backslashes, `%09`/`%0A`/`%0D`,
  raw TAB) produced no `Location` that resolves to another host. A copy of
  this app switched to `"as-needed"` on the same next-intl version did redirect
  `/tr/%09/evilhost` to `http://evilhost/`, so keep `"always"` while on 3.x.
- `next-intl@3.26.5`, GHSA-4c35-wcg5-mm9h (prototype pollution): needs
  `experimental.messages.precompile`, which this code does not use.
- The `postcss` copy bundled inside `next` is used at build time to process this
  repository's own CSS.

Moving to Next.js 15/16 and next-intl 4 is the real fix and is not done here.

## Relationship to pikaedit.com

pikaedit.com runs these tools inside the full site. This repository is a
snapshot of that code (November 2026) reduced to what the two tools need.
Changes on the live site are not synced here automatically.

## License

MIT — see [LICENSE](LICENSE).

## Third-party software

Dependencies are installed from npm and keep their own licenses; see
[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) (generated from
`package-lock.json` by `npm run third-party-licenses`). No copyleft license is
used by the runtime dependencies; the only copyleft package (`axe-core`,
MPL-2.0) is a development-only dependency of the linter config.
