import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Terminology Translator",
  description: "Glossary-controlled translation of English irrigation content into multiple languages.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
