import type { Metadata, Viewport } from "next";
import { Vazirmatn, Baloo_2 } from "next/font/google";
import "./globals.css";
import BottomNav from "./components/BottomNav";

// Vazirmatn covers both Latin and Persian, so it serves body text + all Persian.
const vazirmatn = Vazirmatn({
  subsets: ["latin", "arabic"],
  variable: "--font-vazirmatn",
  display: "swap",
});

// Baloo 2 is a round, friendly, storybook display face for English headings.
const baloo = Baloo_2({
  subsets: ["latin"],
  variable: "--font-display",
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
  themeColor: "#cf4fa6",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${vazirmatn.variable} ${baloo.variable} antialiased`}>
        <div className="mx-auto min-h-dvh max-w-lg px-4 pb-24 pt-6">{children}</div>
        <BottomNav />
      </body>
    </html>
  );
}
