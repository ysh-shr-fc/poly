import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CopyGlot",
  description: "Glossary-controlled translation of English irrigation content into multiple languages.",
  icons: { icon: "/favicon.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
