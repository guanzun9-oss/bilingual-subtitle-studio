import { notFound } from "next/navigation";
import { getMessages, isLocale, localeInfo } from "@/lib/i18n";
import { Faq, Hero, SiteFooter, SiteNav, Steps, Why } from "../site";
import SubtitleTool from "../subtitle-tool";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getMessages(locale);
  const info = localeInfo(locale);
  return (
    <>
      <SiteNav t={t} locale={locale} />
      <main>
        <Hero t={t} target={info.target} />
        <Why t={t} />
        <Steps t={t} />
        <SubtitleTool t={t} locale={locale} defaultTarget={info.target} />
        <Faq t={t} />
      </main>
      <SiteFooter t={t} />
    </>
  );
}
