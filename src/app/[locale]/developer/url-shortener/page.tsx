import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import UrlShortenerClient from "./_client";
import { buildAlternates } from "@/lib/utils/metadata";

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({
    locale,
    namespace: "developer.url-shortener",
  });
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://pikaedit.com";
  return {
    title: t("seoTitle"),
    description: t("seoDescription"),
    alternates: buildAlternates("developer/url-shortener", locale),
    openGraph: {
      title: t("seoTitle"),
      description: t("seoDescription"),
      type: "website",
      url: `/${locale}/developer/url-shortener`,
      siteName: "PikaEdit",
      locale: locale === "tr" ? "tr_TR" : "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title: t("seoTitle"),
      description: t("seoDescription"),
    },
  };
}

export default function UrlShortenerPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: string };
  searchParams?: { error?: string };
}) {
  setRequestLocale(locale);
  const toolUrl = `${
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://pikaedit.com"
  }/${locale}/developer/url-shortener`;
  const initialError = searchParams?.error ?? null;
  return <UrlShortenerClient toolUrl={toolUrl} initialError={initialError} />;
}
