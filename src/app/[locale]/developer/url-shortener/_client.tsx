"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link, Copy, Check, ChevronDown, ChevronUp, AlertCircle, Info } from "lucide-react";
import { clsx } from "clsx";
import { ToolLayout } from "@/components/tools/ToolLayout";

type ExpiryOption = "never" | "7d" | "30d" | "1y";

interface ShortenResult {
  id: string;
  shortUrl: string;
  originalUrl: string;
  expiresAt: number | null;
}

function truncateUrl(url: string, maxLen = 60): string {
  if (url.length <= maxLen) return url;
  return url.slice(0, maxLen) + "…";
}

export default function UrlShortenerClient({
  toolUrl,
  initialError,
}: {
  toolUrl?: string;
  initialError?: string | null;
}) {
  const t = useTranslations();
  const locale = useLocale();

  const [url, setUrl] = useState("");
  const [expiry, setExpiry] = useState<ExpiryOption>("never");
  const [showOptions, setShowOptions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ShortenResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // Handle error params from redirect route
  useEffect(() => {
    if (initialError === "notfound") {
      setError(t("developer.url-shortener.errorNotFound"));
    } else if (initialError === "expired") {
      setError(t("developer.url-shortener.errorNotFound"));
    }
  }, [initialError, t]);

  // Generate QR code whenever result changes
  useEffect(() => {
    if (!result?.shortUrl) {
      setQrDataUrl(null);
      return;
    }

    let cancelled = false;

    import("qrcode").then((QRCode) => {
      return QRCode.toDataURL(result.shortUrl, {
        width: 200,
        margin: 2,
        color: { dark: "#1e293b", light: "#ffffff" },
      });
    }).then((dataUrl) => {
      if (!cancelled) setQrDataUrl(dataUrl);
    }).catch(() => {
      if (!cancelled) setQrDataUrl(null);
    });

    return () => { cancelled = true; };
  }, [result?.shortUrl]);

  const handleShorten = useCallback(async () => {
    const trimmed = url.trim();

    if (!trimmed) {
      setError(t("developer.url-shortener.errorInvalidUrl"));
      return;
    }

    if (trimmed.length > 2048) {
      setError(t("developer.url-shortener.errorTooLong"));
      return;
    }

    // Basic URL check on the client before sending
    try {
      const parsed = new URL(trimmed);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        setError(t("developer.url-shortener.errorInvalidUrl"));
        return;
      }
    } catch {
      setError(t("developer.url-shortener.errorInvalidUrl"));
      return;
    }

    setError(null);
    setLoading(true);
    setResult(null);
    setQrDataUrl(null);

    try {
      const res = await fetch("/api/shorten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed, expiry }),
      });

      const data = await res.json() as Record<string, unknown>;

      if (!res.ok) {
        const msg = typeof data.error === "string" ? data.error : "";
        if (res.status === 429) {
          setError(t("developer.url-shortener.errorRateLimit"));
        } else if (msg.toLowerCase().includes("too long") || msg.includes("2048")) {
          setError(t("developer.url-shortener.errorTooLong"));
        } else {
          setError(t("developer.url-shortener.errorInvalidUrl"));
        }
        return;
      }

      setResult({
        id:          data.id          as string,
        shortUrl:    data.shortUrl    as string,
        originalUrl: data.originalUrl as string,
        expiresAt:   (data.expiresAt  as number | null) ?? null,
      });
    } catch {
      setError(t("developer.url-shortener.errorInvalidUrl"));
    } finally {
      setLoading(false);
    }
  }, [url, expiry, t]);

  const handleCopy = useCallback(async () => {
    if (!result?.shortUrl) return;
    await navigator.clipboard.writeText(result.shortUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [result]);

  const handleReset = useCallback(() => {
    setUrl("");
    setResult(null);
    setError(null);
    setQrDataUrl(null);
    setCopied(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const expiryOptions: { value: ExpiryOption; label: string }[] = [
    { value: "never", label: t("developer.url-shortener.expiryNever") },
    { value: "7d",    label: t("developer.url-shortener.expiry7d") },
    { value: "30d",   label: t("developer.url-shortener.expiry30d") },
    { value: "1y",    label: t("developer.url-shortener.expiry1y") },
  ];

  const faqs = [
    {
      question: t("developer.url-shortener.faq1q"),
      answer:   t("developer.url-shortener.faq1a"),
    },
    {
      question: t("developer.url-shortener.faq2q"),
      answer:   t("developer.url-shortener.faq2a"),
    },
    {
      question: t("developer.url-shortener.faq3q"),
      answer:   t("developer.url-shortener.faq3a"),
    },
  ];

  // Display copy of short URL without the protocol for a cleaner look
  const shortDisplayUrl = result
    ? result.shortUrl.replace(/^https?:\/\//, "")
    : "";

  return (
    <ToolLayout
      title={t("developer.url-shortener.title")}
      description={t("developer.url-shortener.description")}
      breadcrumbs={[
        { label: t("nav.developer"), href: `/${locale}/developer` },
        { label: t("developer.url-shortener.title") },
      ]}
      howToUseSteps={[
        t("developer.url-shortener.step1"),
        t("developer.url-shortener.step2"),
        t("developer.url-shortener.step3"),
      ]}
      faqs={faqs}
      toolUrl={toolUrl}
    >
      <div className="space-y-5">
        {/* Server notice */}
        <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-700">
          <Info className="w-4 h-4 mt-0.5 shrink-0 text-blue-500" />
          <p>{t("developer.url-shortener.serverNotice")}</p>
        </div>

        {/* Input area */}
        <div className="space-y-3">
          <label
            htmlFor="url-input"
            className="block text-sm font-medium text-slate-700"
          >
            URL
          </label>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              id="url-input"
              type="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleShorten();
              }}
              placeholder={t("developer.url-shortener.inputPlaceholder")}
              className={clsx(
                "flex-1 px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-colors font-mono",
                error
                  ? "border-red-300 focus:ring-red-400 bg-red-50"
                  : "border-slate-200 focus:ring-brand-400 focus:border-brand-400 bg-white"
              )}
              aria-describedby={error ? "url-error" : undefined}
              disabled={loading}
              autoComplete="url"
            />
            <button
              onClick={() => void handleShorten()}
              disabled={loading || !url.trim()}
              className={clsx(
                "px-5 py-3 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap",
                loading || !url.trim()
                  ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                  : "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800"
              )}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  {t("developer.url-shortener.shortenButton")}
                </span>
              ) : (
                t("developer.url-shortener.shortenButton")
              )}
            </button>
          </div>

          {/* Error message */}
          {error && (
            <div
              id="url-error"
              role="alert"
              className="flex items-center gap-2 text-sm text-red-600"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Expiry options (accordion) */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowOptions((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors text-sm font-medium text-slate-700"
            aria-expanded={showOptions}
          >
            <span className="flex items-center gap-2">
              <Link className="w-4 h-4 text-slate-400" />
              {t("developer.url-shortener.expiry")}
              {expiry !== "never" && (
                <span className="px-2 py-0.5 bg-brand-100 text-brand-700 text-xs rounded-full font-semibold">
                  {expiryOptions.find((o) => o.value === expiry)?.label}
                </span>
              )}
            </span>
            {showOptions ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {showOptions && (
            <div className="px-4 pb-4 pt-2 bg-white border-t border-slate-100">
              <div className="flex flex-wrap gap-2">
                {expiryOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setExpiry(opt.value)}
                    className={clsx(
                      "px-4 py-2 rounded-lg text-sm font-medium border transition-colors",
                      expiry === opt.value
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Result card */}
        {result && (
          <div className="border border-emerald-200 rounded-2xl overflow-hidden bg-white shadow-sm">
            {/* Header */}
            <div className="h-1.5 w-full bg-gradient-to-r from-emerald-400 to-brand-500" />

            <div className="p-6 space-y-5">
              {/* Short URL display */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                  {t("developer.url-shortener.title")}
                </p>
                <div className="flex items-center gap-3">
                  <p
                    className="flex-1 text-2xl sm:text-3xl font-bold text-slate-900 font-mono break-all leading-tight"
                    aria-live="polite"
                  >
                    {shortDisplayUrl}
                  </p>
                  <button
                    onClick={() => void handleCopy()}
                    className={clsx(
                      "shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors",
                      copied
                        ? "bg-emerald-500 text-white"
                        : "bg-brand-600 text-white hover:bg-brand-700"
                    )}
                    aria-label={t("developer.url-shortener.copyButton")}
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4" />
                        {t("developer.url-shortener.copied")}
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        {t("developer.url-shortener.copyButton")}
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Expiry row — no click counter: the UI never fetches click stats. */}
              {result.expiresAt !== null && (
                <p className="text-sm text-slate-400">
                  {t("developer.url-shortener.expiry")}:{" "}
                  {new Date(result.expiresAt * 1000).toLocaleDateString(
                    locale === "tr" ? "tr-TR" : "en-US",
                    { day: "numeric", month: "short", year: "numeric" }
                  )}
                </p>
              )}

              {/* Original URL */}
              <div className="p-3 bg-slate-50 rounded-xl">
                <p className="text-xs font-medium text-slate-500 mb-1">
                  {t("developer.url-shortener.originalUrl")}
                </p>
                <p className="text-sm text-slate-600 font-mono break-all">
                  {truncateUrl(result.originalUrl, 80)}
                </p>
              </div>

              {/* QR Code */}
              {qrDataUrl && (
                <div className="flex flex-col items-center gap-3 pt-2">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide self-start">
                    QR
                  </p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrDataUrl}
                    alt={`QR code for ${result.shortUrl}`}
                    width={160}
                    height={160}
                    className="rounded-xl border border-slate-100 shadow-sm"
                  />
                  <a
                    href={qrDataUrl}
                    download={`qr-${result.id}.png`}
                    className="text-xs text-brand-600 hover:text-brand-700 font-medium underline underline-offset-2"
                  >
                    Download QR
                  </a>
                </div>
              )}

              {/* New URL button */}
              <button
                onClick={handleReset}
                className="w-full py-2.5 text-sm font-medium text-slate-500 hover:text-slate-700 border border-dashed border-slate-200 rounded-xl hover:border-slate-300 transition-colors"
              >
                + {t("developer.url-shortener.shortenAnother")}
              </button>
            </div>
          </div>
        )}
      </div>
    </ToolLayout>
  );
}
