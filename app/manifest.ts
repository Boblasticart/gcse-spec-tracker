import type { MetadataRoute } from "next";

/** Web app manifest, so the tracker can be installed and opened like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GCSE Spec Tracker",
    short_name: "GCSE Tracker",
    description: "Track every GCSE spec point, practise exam questions and see your progress.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#fafafa",
    theme_color: "#4f46e5",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
