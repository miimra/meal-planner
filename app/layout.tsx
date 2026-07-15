import type { Metadata, Viewport } from "next";
import { Vazirmatn } from "next/font/google";
import "./globals.css";
import BottomNav from "./components/BottomNav";

// Vazirmatn covers both Latin and Persian, so one font serves the whole UI.
const vazirmatn = Vazirmatn({
  subsets: ["latin", "arabic"],
  variable: "--font-vazirmatn",
  display: "swap",
});

export const metadata: Metadata = {
  title: "What's for Dinner?",
  description: "A calm, pre-decided dinner plan on a 2-week rotation.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Dinner",
  },
};

export const viewport: Viewport = {
  themeColor: "#3f6a2e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${vazirmatn.variable} antialiased`}>
        <div className="mx-auto min-h-dvh max-w-lg px-4 pb-24 pt-6">{children}</div>
        <BottomNav />
      </body>
    </html>
  );
}
