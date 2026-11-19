import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { LOCALES, getMessages, isLocale, localeInfo } from "@/lib/i18n";
import "../globals.css";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = getMessages(locale);
  const headerList = await headers();
  const host =
    headerList.get("x-forwarded-host") ||
    headerList.get("host") ||
    "localhost:3000";
  const protocol =
    headerList.get("x-forwarded-proto") ||
    (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const imageUrl = `${origin}/og-v2.png`;
  const title = t.brandLocal ? `Cuewise ${t.brandLocal}` : "Cuewise";

  return {
    title: t.meta.title,
    description: t.meta.description,
    icons: { icon: "/favicon.svg" },
    alternates: {
      canonical: `${origin}/${locale}`,
      // Every language version, so search engines show readers their own.
      languages: Object.fromEntries([
        ...LOCALES.map((entry) => [entry.code, `${origin}/${entry.code}`]),
        ["x-default", `${origin}/`],
      ]),
    },
    openGraph: {
      title,
      description: t.meta.description,
      type: "website",
      locale,
      images: [{ url: imageUrl, width: 1792, height: 909 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: t.meta.description,
      images: [imageUrl],
    },
  };
}

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
}> & Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html lang={locale} dir={localeInfo(locale).dir}>
      <body>{children}</body>
    </html>
  );
}
