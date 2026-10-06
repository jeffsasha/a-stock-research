import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "A股研究台 · 新闻、研报与基本面",
  description: "按股票代码或名称汇总A股行情、财务、资金流、新闻和研报，查看有来源、有日期的中文研究摘要。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
