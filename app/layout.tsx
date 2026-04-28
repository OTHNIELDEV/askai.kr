import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ASKAI 아스카이",
  description: "Paste, mark up, and copy visual context for AI conversations with ASKAI."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
