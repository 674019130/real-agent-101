import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Real Agent 101 — 从零构建 Agent",
  description:
    "从 raw API 开始，亲手构建一个类 Claude Code 的 CLI Agent。逐课搭建，对比生产实现。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
