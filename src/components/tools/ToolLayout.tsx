// Simplified for this repository: the live site renders ToolLayout with a
// breadcrumb trail, the privacy/server-processing badge resolved from the
// site navigation, related tools and a related guide. This version keeps the
// same props and renders the title, description, the URL shortener's
// server-processing sentence, the tool UI, "how to use" steps and the FAQ.
// Breadcrumbs are accepted but not rendered (their category pages are not
// part of this repository).
import { useTranslations } from "next-intl";
import { FaqJsonLd } from "@/components/seo/FaqJsonLd";

interface FaqItem {
  question: string;
  answer: string;
}

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface ToolLayoutProps {
  title: string;
  description: string;
  breadcrumbs: BreadcrumbItem[];
  children: React.ReactNode;
  howToUseSteps?: string[];
  faqs?: FaqItem[];
  toolUrl?: string;
}

export function ToolLayout({
  title,
  description,
  children,
  howToUseSteps,
  faqs,
}: ToolLayoutProps): JSX.Element {
  const t = useTranslations("tools");
  const tMeta = useTranslations("meta");
  return (
    <div className="max-w-[1200px] mx-auto px-4 py-8">
      {faqs && faqs.length > 0 && <FaqJsonLd items={faqs} />}
      <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
      <p className="mt-2 text-slate-600">{description}</p>
      <p className="mt-3 text-sm text-slate-500">{tMeta("serverProcessing.shortener")}</p>
      <div className="mt-6">{children}</div>
      {howToUseSteps && howToUseSteps.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">{t("howToUse")}</h2>
          <ol className="mt-3 list-decimal pl-5 space-y-1">
            {howToUseSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      )}
      {faqs && faqs.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">{t("faq")}</h2>
          {faqs.map((faq) => (
            <details key={faq.question} className="mt-3">
              <summary className="font-medium cursor-pointer">{faq.question}</summary>
              <p className="mt-1 text-slate-600">{faq.answer}</p>
            </details>
          ))}
        </section>
      )}
    </div>
  );
}
