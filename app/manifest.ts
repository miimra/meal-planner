import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Family Meal Plan",
    short_name: "Meals",
    description: "Today, tomorrow, and the family meal plan for the week.",
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
