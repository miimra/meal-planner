import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "What's for Dinner?",
    short_name: "Dinner",
    description: "A calm, pre-decided dinner plan on a 2-week rotation.",
    start_url: "/",
    display: "standalone",
    background_color: "#fdf1f7",
    theme_color: "#cf4fa6",
    orientation: "portrait",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
