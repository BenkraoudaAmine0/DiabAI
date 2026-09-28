import type { Metadata } from "next";
import "./globals.css";

import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/i18n";

export const metadata: Metadata = {
  title: "DiabAI — AI-powered diabetes screening",
  description:
    "Diabetes risk prediction, foot / neck / eye complication screening and a cited AI assistant for doctors and patients.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-slate-50 text-slate-900">
        <LanguageProvider>
          <AuthProvider>{children}</AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
