import type { Metadata, Viewport } from "next";
import { Vazirmatn, Syne } from "next/font/google";
import "./globals.css";
import BottomNav from "./components/BottomNav";

// Vazirmatn carries body text and every Persian name — one family, so the two
// scripts sit at the same weight and rhythm instead of looking bolted together.
const vazirmatn = Vazirmatn({
  subsets: ["latin", "arabic"],
  variable: "--font-vazirmatn",
  display: "swap",
});

// Syne for display: angular and geometric, an echo of the girih lattice.
const syne = Syne({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sofreh — Family Meal Plan",
  description: "Today, tomorrow, and the family meal plan for the week.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Sofreh" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e9f3f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0a131e" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${vazirmatn.variable} ${syne.variable} antialiased`}>
        <div className="relative mx-auto min-h-dvh max-w-lg px-4 pb-28 pt-6">{children}</div>
        <BottomNav />
      </body>
    </html>
  );
}
