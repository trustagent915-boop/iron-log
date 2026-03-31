import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Iron Log",
    short_name: "Iron Log",
    description:
      "Training cockpit per tracciare programma, custom workout e statistiche sul tuo dispositivo.",
    start_url: "/",
    display: "standalone",
    background_color: "#11141a",
    theme_color: "#11141a",
    lang: "it",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any"
      }
    ]
  };
}
