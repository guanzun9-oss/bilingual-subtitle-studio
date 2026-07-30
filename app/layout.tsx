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

  return {
    title: "双语字幕工坊｜英文 SRT 转中英双语字幕",
    description:
      "先合并 Buzz 拆散的短片段，再用 DeepSeek 生成自然对齐的中英双语字幕。",
    openGraph: {
      title: "双语字幕工坊",
      description: "语义合并、自动重试，让中英文自然对齐。",
      type: "website",
      images: [{ url: imageUrl, width: 1792, height: 909 }],
    },
    twitter: {
      card: "summary_large_image",
      title: "双语字幕工坊",
      description: "语义合并、自动重试，让中英文自然对齐。",
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
