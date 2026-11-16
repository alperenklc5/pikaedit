"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  Upload,
  Lock,
  Clock,
  Copy,
  Check,
  ExternalLink,
  Shield,
  AlertCircle,
  X,
  Download,
  Info,
  ChevronDown,
} from "lucide-react";
import QRCode from "qrcode";
import { clsx } from "clsx";
import { getExtension, SHARE_BLOCKED_EXTENSIONS } from "@/lib/utils/upload-extensions";

type Expiry = "30m" | "1h" | "24h" | "3d" | "7d";
type MaxDl = "1" | "5" | "10" | "0";
type Step = "upload" | "uploading" | "done";


function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatExpiry(t: ReturnType<typeof useTranslations>, expiry: Expiry): string {
  const map: Record<Expiry, string> = {
    "30m": t("share.expiry30m"),
    "1h": t("share.expiry1h"),
    "24h": t("share.expiry24h"),
    "3d": t("share.expiry3d"),
    "7d": t("share.expiry7d"),
  };
  return map[expiry];
}

export default function ShareClient() {
  const t = useTranslations();
  const locale = useLocale();

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [expiry, setExpiry] = useState<Expiry>("24h");
  const [password, setPassword] = useState("");
  const [maxDownloads, setMaxDownloads] = useState<MaxDl>("0");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState("");
  const [expiresAt, setExpiresAt] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Generate QR when link is set
  useEffect(() => {
    if (!shareLink) return;
    QRCode.toDataURL(shareLink, { width: 200, margin: 2 })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(null));
  }, [shareLink]);

  const validateFile = useCallback(
    (f: File): string | null => {
      if (f.size === 0) return t("share.errorEmpty");
      if (f.size > 500 * 1024 * 1024) return t("share.errorTooLarge");
      if (SHARE_BLOCKED_EXTENSIONS.has(getExtension(f.name))) return t("share.errorBlockedType");
      return null;
    },
    [t]
  );

  const handleFileSelect = useCallback(
    (files: FileList | File[]) => {
      const f = files instanceof FileList ? files[0] : files[0];
      if (!f) return;
      const err = validateFile(f);
      if (err) { setError(err); return; }
      setFile(f);
      setError(null);
    },
    [validateFile]
  );

  const handleUpload = useCallback(async () => {
    if (!file) return;
    setError(null);
    setStep("uploading");
    setUploadProgress(0);

    // Use XMLHttpRequest for real progress
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        setUploadProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status === 201) {
        let data: { id: string; url: string; expiresAt: number };
        try {
          data = JSON.parse(xhr.responseText) as typeof data;
        } catch {
          setError(t("share.errorUploadFailed"));
          setStep("upload");
          return;
        }
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const link = `${origin}/${locale}/s/${data.id}`;
        setShareLink(link);
        setExpiresAt(data.expiresAt);
        setStep("done");
      } else {
        // Map status codes to translated messages; server strings are English-only.
        const byStatus: Record<number, string> = {
          400: t("share.errorUploadFailed"),
          413: t("share.errorTooLarge"),
          422: t("share.errorBlockedType"),
        };
        setError(byStatus[xhr.status] ?? t("share.errorUploadFailed"));
        setStep("upload");
      }
    });

    xhr.addEventListener("error", () => {
      setError(t("share.errorNetwork"));
      setStep("upload");
    });

    // Raw body upload: the server streams it straight to disk.
    xhr.open("POST", "/api/share");
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    if (file.type) xhr.setRequestHeader("X-File-Type", file.type);
    xhr.setRequestHeader("X-Expiry", expiry);
    if (password.trim()) xhr.setRequestHeader("X-Share-Password", encodeURIComponent(password.trim()));
    if (maxDownloads !== "0") xhr.setRequestHeader("X-Max-Downloads", maxDownloads);
    xhr.send(file);
  }, [file, expiry, password, maxDownloads, locale, t]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [shareLink]);

  const handleReset = useCallback(() => {
    setStep("upload");
    setFile(null);
    setExpiry("24h");
    setPassword("");
    setMaxDownloads("0");
    setUploadProgress(0);
    setError(null);
    setShareLink("");
    setExpiresAt(0);
    setCopied(false);
    setQrDataUrl(null);
  }, []);

  const expiryOptions: { value: Expiry; label: string }[] = [
    { value: "30m", label: t("share.expiry30m") },
    { value: "1h",  label: t("share.expiry1h") },
    { value: "24h", label: t("share.expiry24h") },
    { value: "3d",  label: t("share.expiry3d") },
    { value: "7d",  label: t("share.expiry7d") },
  ];

  const maxDlOptions: { value: MaxDl; label: string }[] = [
    { value: "0",  label: t("share.dlUnlimited") },
    { value: "1",  label: "1" },
    { value: "5",  label: "5" },
    { value: "10", label: "10" },
  ];

  // ── Done state ──────────────────────────────────────────────────────────────
  if (step === "done") {
    const deletesOn = new Date(expiresAt * 1000).toLocaleString();
    return (
      <div className="tool-container">
        <div className="max-w-xl mx-auto py-8">
          <div className="flex justify-center mb-5">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <Download className="w-8 h-8 text-green-600" />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">
            {t("share.readyTitle")}
          </h1>
          <p className="text-sm text-gray-500 text-center mb-8">
            {t("share.readyDesc")}
          </p>

          {/* Link box */}
          <div className="border border-surface-border rounded-xl p-4 bg-gray-50 mb-4">
            <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">
              {t("share.shareLink")}
            </p>
            <p className="text-sm font-mono text-gray-700 break-all leading-relaxed">
              {shareLink}
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-2 mb-6">
            <button
              onClick={handleCopy}
              className={clsx(
                "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl transition-colors",
                copied ? "bg-green-600 text-white" : "bg-brand-600 text-white hover:bg-brand-700"
              )}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? t("common.copied") : t("share.copyLink")}
            </button>
            <a
              href={shareLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-700 hover:border-brand-300 hover:text-brand-600 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              {t("share.openLink")}
            </a>
          </div>

          {/* QR Code */}
          {qrDataUrl && (
            <div className="flex flex-col items-center gap-2 mb-6">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                {t("share.qrCode")}
              </p>
              <div className="border border-gray-100 rounded-xl p-3 bg-white">
                <img src={qrDataUrl} alt="QR Code" className="w-40 h-40" />
              </div>
            </div>
          )}

          {/* Info pills */}
          <div className="flex flex-wrap gap-2 mb-8 justify-center">
            <span className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
              <Clock className="w-3 h-3" />
              {t("share.deletesOn", { date: deletesOn })}
            </span>
            {password && (
              <span className="flex items-center gap-1.5 text-xs text-brand-700 bg-brand-50 px-2.5 py-1 rounded-full">
                <Lock className="w-3 h-3" />
                {t("share.passwordProtected")}
              </span>
            )}
            {maxDownloads !== "0" && (
              <span className="flex items-center gap-1.5 text-xs text-orange-700 bg-orange-50 px-2.5 py-1 rounded-full">
                <Download className="w-3 h-3" />
                {t("share.limitedDownloads", { count: maxDownloads })}
              </span>
            )}
          </div>

          {/* Server notice */}
          <div className="flex gap-3 p-4 bg-blue-50 border border-blue-100 rounded-xl mb-6">
            <Shield className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
            <p className="text-sm text-blue-800">{t("share.serverNotice")}</p>
          </div>

          <button
            onClick={handleReset}
            className="w-full text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            {t("share.shareAnother")}
          </button>
        </div>
      </div>
    );
  }

  // ── Uploading state ─────────────────────────────────────────────────────────
  if (step === "uploading") {
    return (
      <div className="tool-container">
        <div className="max-w-xl mx-auto py-16 flex flex-col items-center gap-6">
          <div className="w-16 h-16 rounded-full bg-brand-50 flex items-center justify-center">
            <Upload className="w-8 h-8 text-brand-600 animate-bounce" />
          </div>
          <div className="w-full space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>{t("share.uploading")}</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-brand-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 text-center">
              {file?.name} — {formatBytes(file?.size ?? 0)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Upload state ────────────────────────────────────────────────────────────
  return (
    <div className="tool-container">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">{t("share.title")}</h1>
          <p className="text-sm text-gray-500">{t("share.description")}</p>
        </div>

        {/* Server notice */}
        <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-5">
          <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
          <p className="text-sm text-blue-700">{t("share.serverNotice")}</p>
        </div>

        {/* Dropzone */}
        {!file ? (
          <div
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFileSelect(e.dataTransfer.files);
            }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => fileInputRef.current?.click()}
            className={clsx(
              "flex flex-col items-center justify-center gap-4 border-2 border-dashed rounded-2xl p-12 cursor-pointer transition-colors mb-5",
              dragOver
                ? "border-brand-400 bg-brand-50/40"
                : "border-gray-200 bg-gray-50 hover:border-brand-400 hover:bg-brand-50/30"
            )}
            role="button"
            tabIndex={0}
            aria-label={t("share.uploadAriaLabel")}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
          >
            <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center">
              <Upload className="w-7 h-7 text-brand-600" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-gray-700">{t("share.dropzoneTitle")}</p>
              <p className="text-sm text-gray-400 mt-1">{t("share.dropzoneHint")}</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => { if (e.target.files) handleFileSelect(e.target.files); e.target.value = ""; }}
              aria-label={t("share.uploadAriaLabel")}
            />
          </div>
        ) : (
          <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-5">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                <Upload className="w-4 h-4 text-brand-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                <p className="text-xs text-gray-400">{formatBytes(file.size)}</p>
              </div>
            </div>
            <button
              onClick={() => { setFile(null); setError(null); }}
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0 ml-2"
              aria-label={t("common.clear")}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Options */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          {/* Expiry */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1 mb-1.5">
              <Clock className="w-3 h-3" />
              {t("share.expiryLabel")}
            </label>
            <div className="relative">
              <select
                value={expiry}
                onChange={(e) => setExpiry(e.target.value as Expiry)}
                className="w-full appearance-none px-3 py-2 text-sm border border-surface-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-300 bg-white pr-8"
              >
                {expiryOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            </div>
          </div>

          {/* Max downloads */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1 mb-1.5">
              <Download className="w-3 h-3" />
              {t("share.maxDownloadsLabel")}
            </label>
            <div className="relative">
              <select
                value={maxDownloads}
                onChange={(e) => setMaxDownloads(e.target.value as MaxDl)}
                className="w-full appearance-none px-3 py-2 text-sm border border-surface-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-300 bg-white pr-8"
              >
                {maxDlOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1 mb-1.5">
              <Lock className="w-3 h-3" />
              {t("share.passwordLabel")}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("share.passwordPlaceholder")}
              className="w-full px-3 py-2 text-sm border border-surface-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-300 bg-white"
              autoComplete="new-password"
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Upload button */}
        <button
          onClick={handleUpload}
          disabled={!file}
          className={clsx(
            "w-full flex items-center justify-center gap-2 px-5 py-3.5 text-sm font-semibold rounded-xl transition-colors",
            !file
              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
              : "bg-brand-600 text-white hover:bg-brand-700"
          )}
        >
          <Upload className="w-4 h-4" />
          {t("share.uploadButton")}
        </button>

        {/* FAQ */}
        <div className="mt-10 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            {t("tools.faq")}
          </h2>
          {[
            { q: t("share.faq1q"), a: t("share.faq1a") },
            { q: t("share.faq2q"), a: t("share.faq2a") },
            { q: t("share.faq3q"), a: t("share.faq3a") },
          ].map(({ q, a }) => (
            <div key={q} className="border border-surface-border rounded-xl p-4">
              <p className="text-sm font-medium text-gray-800 mb-1">{q}</p>
              <p className="text-sm text-gray-500">{a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
