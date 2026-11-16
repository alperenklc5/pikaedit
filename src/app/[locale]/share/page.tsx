import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import ShareClient from "./_client";
import { ToolGuideBox } from "@/components/tools/ToolGuideBox";
import { ToolJsonLd } from "@/components/seo/ToolJsonLd";
import { FaqJsonLd } from "@/components/seo/FaqJsonLd";
import { BreadcrumbJsonLd } from "@/components/seo/BreadcrumbJsonLd";
import { buildAlternates } from "@/lib/utils/metadata";

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "share" });
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://pikaedit.com";
  return {
    title: t("seoTitle"),
    description: t("seoDescription"),
    alternates: buildAlternates("share", locale),
    openGraph: {
      title: t("seoTitle"),
      description: t("seoDescription"),
      type: "website",
      url: `/${locale}/share`,
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

export default async function SharePage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  const t = await getTranslations({ locale });
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://pikaedit.com";
  const toolUrl = `${baseUrl}/${locale}/share`;

  return (
    <>
      <ToolJsonLd
        name={t("share.title")}
        description={t("share.description")}
        url={toolUrl}
      />
      <FaqJsonLd
        items={[
          { question: t("share.faq1q"), answer: t("share.faq1a") },
          { question: t("share.faq2q"), answer: t("share.faq2a") },
          { question: t("share.faq3q"), answer: t("share.faq3a") },
        ]}
      />
      <BreadcrumbJsonLd
        items={[
          { name: "PikaEdit", url: `${baseUrl}/${locale}` },
          { name: t("share.title"), url: toolUrl },
        ]}
      />
      <ShareClient />
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <ToolGuideBox toolPath="/share" locale={locale} />
      </div>
    </>
  );
}
