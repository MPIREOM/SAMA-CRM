import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sama Hotel — Jabal Al Akhdar",
    short_name: "Sama Hotel",
    description: "Book direct at Sama Hotel, a mountain resort at 2,000 m in Jabal Al Akhdar, Oman. Pay at the hotel.",
    start_url: "/en",
    display: "standalone",
    background_color: "#faf6f0",
    theme_color: "#3b171b",
    lang: "en",
    icons: [
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
      { src: "/favicon-48.png", sizes: "48x48", type: "image/png" },
    ],
  };
}
