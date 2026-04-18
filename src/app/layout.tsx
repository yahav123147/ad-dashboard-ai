import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ad Dashboard AI",
  description: "דאשבורד לניהול קמפיינים ב-Meta עם תובנות AI",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
