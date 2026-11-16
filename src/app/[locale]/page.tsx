// Simplified for this repository: the live site renders the home page with
// the full tool directory (40+ tools, categories, search). Here it only links
// to the two tools in this repository, so "/" and "/<locale>" do not 404.
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";

export default async function HomePage({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<JSX.Element> {
  setRequestLocale(locale);
  const t = await getTranslations({ locale });
  const tools = [
    { href: `/${locale}/share`, title: t("share.title"), description: t("share.description") },
    {
      href: `/${locale}/developer/url-shortener`,
      title: t("developer.url-shortener.title"),
      description: t("developer.url-shortener.description"),
    },
  ];
  return (
    <div className="max-w-[1200px] mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-slate-900">{t("meta.siteName")}</h1>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {tools.map((tool) => (
          <li key={tool.href}>
            <Link
              href={tool.href}
              className="block rounded-xl border border-slate-200 p-6 hover:border-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <h2 className="text-lg font-semibold text-slate-900">{tool.title}</h2>
              <p className="mt-2 text-sm text-slate-600">{tool.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
