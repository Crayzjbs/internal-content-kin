import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KIN Hub",
  description: "AI content production hub for KIN Creatives' YouTube channels.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
