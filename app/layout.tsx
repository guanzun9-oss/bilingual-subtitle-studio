import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const headerList = await headers();
  const host =
    headerList.get("x-forwarded-host") ||
    headerList.get("host") ||
    "localhost:3000";
  const protocol =
    headerList.get("x-forwarded-proto") ||
    (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og-v2.png`;

  const description = "将 Buzz 识别的英文字幕整理为自然断句、逐条对齐的中英双语 SRT，时间轴与原字幕一致，可直接导入达芬奇与 Premiere Pro。";

  return {
    title: "Cuewise 字幕匠｜英文字幕转中英双语 SRT",
    description,
    icons: { icon: "/favicon.svg" },
    openGraph: {
      title: "Cuewise 字幕匠",
      description,
      type: "website",
      images: [{ url: imageUrl, width: 1792, height: 909 }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Cuewise 字幕匠",
      description,
      images: [imageUrl],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
