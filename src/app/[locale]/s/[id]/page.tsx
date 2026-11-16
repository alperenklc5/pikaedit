import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import DownloadClient from "./_client";

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "share" });
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://pikaedit.com";
  return {
    title: t("downloadSeoTitle"),
    description: t("downloadSeoDescription"),
    robots: { index: false, follow: false },
    alternates: {
      canonical: `${baseUrl}/${locale}/s`,
    },
    openGraph: {
      title: t("downloadSeoTitle"),
      description: t("downloadSeoDescription"),
      type: "website",
      siteName: "PikaEdit",
    },
  };
}

export default function DownloadPage({
  params: { locale, id },
}: {
  params: { locale: string; id: string };
}) {
  setRequestLocale(locale);
  return <DownloadClient id={id} />;
}
