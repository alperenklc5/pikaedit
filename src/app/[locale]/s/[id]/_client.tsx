"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  Download,
  Lock,
  Clock,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  File,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
} from "lucide-react";
import { clsx } from "clsx";

// ── Types ─────────────────────────────────────────────────────────────────────

// Password-protected files only expose id, has_password and limit_reached
// until the password is verified; the other fields are then absent.
interface FileMeta {
  id: string;
  has_password: boolean;
  limit_reached: boolean;
  original_name?: string;
  file_size?: number;
  mime_type?: string | null;
  expires_at?: number;
  download_count?: number;
  max_downloads?: number | null;
}

type PageState =
  | { status: "loading" }
  | { status: "ready"; meta: FileMeta }
  | { status: "expired" }
  | { status: "not_found" }
  | { status: "limit_reached" }
  | { status: "downloading" }
  | { status: "done" }
  | { status: "error"; message: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatTimeRemaining(expiresAt: number): string {
  const diffMs = expiresAt * 1000 - Date.now();
  if (diffMs <= 0) return "expired";
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d`;
}

/** File name from `Content-Disposition: attachment; filename*=UTF-8''<name>`. */
function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const match = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function getMimeIcon(mime: string | null, name: string): React.ElementType {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (mime?.startsWith("image/") || ["jpg","jpeg","png","gif","webp","svg","bmp","ico"].includes(ext)) return FileImage;
  if (mime?.startsWith("video/") || ["mp4","mov","avi","mkv","webm"].includes(ext)) return FileVideo;
  if (mime?.startsWith("audio/") || ["mp3","wav","ogg","flac","aac"].includes(ext)) return FileAudio;
  if (
    mime === "application/zip" ||
    mime === "application/x-rar-compressed" ||
    mime === "application/x-7z-compressed" ||
    ["zip","rar","7z","tar","gz","bz2"].includes(ext)
  ) return FileArchive;
  if (mime?.startsWith("text/") || mime?.includes("pdf") || ["pdf","txt","md","csv","json","xml","yaml"].includes(ext)) return FileText;
  return File;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DownloadClient({ id }: { id: string }) {
  const t = useTranslations("share");

  const [pageState, setPageState] = useState<PageState>({ status: "loading" });
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  // Fetch file metadata on mount
  useEffect(() => {
    let cancelled = false;
    async function fetchMeta() {
      try {
        const res = await fetch(`/api/share/${id}`);
        if (cancelled) return;

        if (res.status === 404) { setPageState({ status: "not_found" }); return; }
        if (res.status === 410) {
          const data = await res.json() as { error?: string };
          if (data.error?.includes("limit")) {
            setPageState({ status: "limit_reached" });
          } else {
            setPageState({ status: "expired" });
          }
          return;
        }
        if (!res.ok) { setPageState({ status: "error", message: t("serverError") }); return; }

        const meta = await res.json() as FileMeta;
        if (meta.limit_reached) {
          setPageState({ status: "limit_reached" });
        } else {
          setPageState({ status: "ready", meta });
        }
      } catch {
        if (!cancelled) setPageState({ status: "error", message: t("serverError") });
      }
    }
    void fetchMeta();
    return () => { cancelled = true; };
  }, [id, t]);

  const handleDownload = useCallback(async () => {
    if (pageState.status !== "ready") return;
    const { meta } = pageState;

    setPasswordError(null);
    setPageState({ status: "downloading" });
    setDownloadProgress(0);

    const body: Record<string, string> = {};
    if (meta.has_password && password.trim()) {
      body.password = password.trim();
    }

    try {
      abortRef.current = new AbortController();
      const res = await fetch(`/api/share/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: abortRef.current.signal,
      });

      if (res.status === 429) {
        setPasswordError(t("tooManyPasswordAttempts"));
        setPageState({ status: "ready", meta });
        return;
      }

      if (res.status === 401 || res.status === 403) {
        setPasswordError(res.status === 401 ? t("passwordRequired") : t("wrongPassword"));
        setPageState({ status: "ready", meta });
        return;
      }

      if (res.status === 410) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setPageState({ status: data.error?.includes("limit") ? "limit_reached" : "expired" });
        return;
      }

      if (!res.ok) {
        setPageState({ status: "error", message: t("serverError") });
        return;
      }

      // Stream download with progress tracking
      const contentLength = Number(res.headers.get("Content-Length") ?? "0");
      const reader = res.body?.getReader();
      if (!reader) throw new Error("no body");

      const chunks: Uint8Array<ArrayBuffer>[] = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value as Uint8Array<ArrayBuffer>);
        received += value.length;
        if (contentLength > 0) {
          setDownloadProgress(Math.round((received / contentLength) * 100));
        }
      }

      const blob = new Blob(chunks, {
        type: res.headers.get("Content-Type") ?? "application/octet-stream",
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        filenameFromDisposition(res.headers.get("Content-Disposition")) ??
        meta.original_name ??
        "download";
      a.click();
      URL.revokeObjectURL(url);

      setPageState({ status: "done" });
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setPageState({
        status: "error",
        message: t("serverError"),
      });
    }
  }, [id, pageState, password, t]);

  // ── Render states ─────────────────────────────────────────────────────────

  if (pageState.status === "loading") {
    return (
      <div className="tool-container">
        <div className="max-w-lg mx-auto py-20 flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-brand-100 border-t-brand-600 animate-spin" />
          <p className="text-sm text-gray-500">{t("loading")}</p>
        </div>
      </div>
    );
  }

  if (pageState.status === "not_found") {
    return (
      <div className="tool-container">
        <div className="max-w-lg mx-auto py-20 text-center">
          <div className="text-6xl mb-4">🔍</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">{t("fileNotFound")}</h1>
          <p className="text-sm text-gray-500">{t("fileNotFoundDesc")}</p>
        </div>
      </div>
    );
  }

  if (pageState.status === "expired") {
    return (
      <div className="tool-container">
        <div className="max-w-lg mx-auto py-20 text-center">
          <div className="text-6xl mb-4">⏰</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">{t("fileExpired")}</h1>
          <p className="text-sm text-gray-500">{t("fileExpiredDesc")}</p>
        </div>
      </div>
    );
  }

  if (pageState.status === "limit_reached") {
    return (
      <div className="tool-container">
        <div className="max-w-lg mx-auto py-20 text-center">
          <div className="text-6xl mb-4">🚫</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">{t("limitReached")}</h1>
          <p className="text-sm text-gray-500">{t("limitReachedDesc")}</p>
        </div>
      </div>
    );
  }

  if (pageState.status === "error") {
    return (
      <div className="tool-container">
        <div className="max-w-lg mx-auto py-20 text-center">
          <div className="flex justify-center mb-4">
            <AlertTriangle className="w-12 h-12 text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">{t("serverError")}</h1>
          <p className="text-sm text-gray-500">{pageState.message}</p>
        </div>
      </div>
    );
  }

  if (pageState.status === "done") {
    return (
      <div className="tool-container">
        <div className="max-w-lg mx-auto py-20 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">{t("downloadComplete")}</h1>
          <p className="text-sm text-gray-500">{t("downloadCompleteDesc")}</p>
        </div>
      </div>
    );
  }

  if (pageState.status === "downloading") {
    return (
      <div className="tool-container">
        <div className="max-w-lg mx-auto py-20 flex flex-col items-center gap-6">
          <div className="w-16 h-16 rounded-full bg-brand-50 flex items-center justify-center">
            <Download className="w-8 h-8 text-brand-600 animate-bounce" />
          </div>
          <div className="w-full space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>{t("downloadingFile")}</span>
              <span>{downloadProgress > 0 ? `${downloadProgress}%` : "…"}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div
                className={clsx(
                  "h-full rounded-full transition-all duration-300",
                  downloadProgress > 0 ? "bg-brand-600" : "bg-brand-300 animate-pulse w-full"
                )}
                style={downloadProgress > 0 ? { width: `${downloadProgress}%` } : {}}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Ready state ───────────────────────────────────────────────────────────
  const { meta } = pageState;
  const hasDetails = meta.original_name !== undefined;
  const Icon = hasDetails ? getMimeIcon(meta.mime_type ?? null, meta.original_name ?? "") : Lock;

  return (
    <div className="tool-container">
      <div className="max-w-lg mx-auto py-10">
        {/* File card */}
        <div className="border border-surface-border rounded-2xl p-6 bg-white shadow-sm mb-6">
          {/* File icon + name */}
          <div className="flex items-start gap-4 mb-5">
            <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center shrink-0">
              <Icon className="w-7 h-7 text-brand-600" />
            </div>
            {hasDetails ? (
              <div className="min-w-0">
                <h1
                  className="text-base font-semibold text-gray-900 break-all leading-tight mb-1"
                  title={meta.original_name}
                >
                  {meta.original_name}
                </h1>
                {meta.file_size !== undefined && (
                  <p className="text-sm text-gray-400">{formatBytes(meta.file_size)}</p>
                )}
              </div>
            ) : (
              <div className="min-w-0">
                <h1 className="text-base font-semibold text-gray-900 leading-tight mb-1">
                  {t("protectedFileTitle")}
                </h1>
                <p className="text-sm text-gray-500">{t("protectedFileDesc")}</p>
              </div>
            )}
          </div>

          {/* Metadata pills */}
          <div className="flex flex-wrap gap-2 mb-5">
            {meta.expires_at !== undefined && (
              <span className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                <Clock className="w-3 h-3" />
                {t("expiresIn", { time: formatTimeRemaining(meta.expires_at) })} —{" "}
                {new Date(meta.expires_at * 1000).toLocaleString()}
              </span>
            )}
            {meta.has_password && (
              <span className="flex items-center gap-1.5 text-xs text-brand-700 bg-brand-50 px-2.5 py-1 rounded-full">
                <Lock className="w-3 h-3" />
                {t("hasPassword")}
              </span>
            )}
            {meta.max_downloads != null && meta.download_count !== undefined && (
              <span className="flex items-center gap-1.5 text-xs text-orange-700 bg-orange-50 px-2.5 py-1 rounded-full">
                <Download className="w-3 h-3" />
                {t("downloadsLeft", {
                  count: meta.max_downloads - meta.download_count,
                  total: meta.max_downloads,
                })}
              </span>
            )}
          </div>

          {/* Password input (only if protected) */}
          {meta.has_password && (
            <div className="mb-4">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1 mb-1.5">
                <Lock className="w-3 h-3" />
                {t("downloadPasswordLabel")}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setPasswordError(null); }}
                  placeholder={t("downloadPasswordPlaceholder")}
                  className={clsx(
                    "w-full px-3 py-2.5 text-sm border rounded-xl focus:outline-none focus:ring-2 bg-white pr-10",
                    passwordError
                      ? "border-red-300 focus:ring-red-300"
                      : "border-surface-border focus:ring-brand-300"
                  )}
                  onKeyDown={(e) => { if (e.key === "Enter") void handleDownload(); }}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {passwordError && (
                <div className="flex items-center gap-1.5 mt-1.5 text-xs text-red-600">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {passwordError}
                </div>
              )}
            </div>
          )}

          {/* Download button */}
          <button
            onClick={() => void handleDownload()}
            disabled={meta.has_password && !password.trim()}
            className={clsx(
              "w-full flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold rounded-xl transition-colors",
              meta.has_password && !password.trim()
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-brand-600 text-white hover:bg-brand-700"
            )}
          >
            <Download className="w-4 h-4" />
            {t("downloadButton")}
          </button>
        </div>

        {/* Server notice */}
        <div className="flex gap-3 p-4 bg-blue-50 border border-blue-100 rounded-xl">
          <AlertCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-700">{t("serverNotice")}</p>
        </div>
      </div>
    </div>
  );
}
