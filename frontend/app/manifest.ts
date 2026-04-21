import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HumRahi Hub",
    short_name: "HumRahi",
    description:
      "Turn local civic problems into actionable solutions—report issues, fund fixes, and volunteer with transparent progress.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#afff6f",
    icons: [
      {
        src: "/icon",
        sizes: "32x32",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
