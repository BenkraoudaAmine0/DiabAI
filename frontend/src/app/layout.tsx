import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import "./globals.css";

import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/i18n";
import { Analytics } from "@vercel/analytics/next";

// Figma design system: Inter for the interface, IBM Plex Mono for lab values
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: "DiabAI — AI-powered diabetes screening",
  description:
    "Diabetes risk prediction, foot / neck / eye complication screening and a cited AI assistant for doctors and patients.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`h-full antialiased ${inter.variable} ${plexMono.variable}`}>
      <body className="min-h-full bg-slate-50 text-slate-900">
        <LanguageProvider>
          <AuthProvider>{children}</AuthProvider>
        </LanguageProvider>
        <Analytics />
      </body>
    </html>
  );
}
