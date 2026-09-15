import localFont from "next/font/local";

// Self-hosted brand fonts (SIL Open Font License, files from @fontsource).
// Local files keep builds independent of Google Fonts availability and avoid
// a third-party request on every page view.
//
// Nunito Sans / Tajawal: body text (brand guideline).
// Cormorant Garamond / Amiri: display faces for the guest site — headings,
// prices and the wordmark. The back-office keeps the sans faces only.

export const nunito = localFont({
  variable: "--font-nunito",
  display: "swap",
  src: [
    { path: "./nunito-sans-latin-300-normal.woff2", weight: "300", style: "normal" },
    { path: "./nunito-sans-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./nunito-sans-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./nunito-sans-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "./nunito-sans-latin-800-normal.woff2", weight: "800", style: "normal" },
  ],
});

export const tajawal = localFont({
  variable: "--font-tajawal",
  display: "swap",
  src: [
    { path: "./tajawal-arabic-300-normal.woff2", weight: "300", style: "normal" },
    { path: "./tajawal-latin-300-normal.woff2", weight: "300", style: "normal" },
    { path: "./tajawal-arabic-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./tajawal-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./tajawal-arabic-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./tajawal-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./tajawal-arabic-700-normal.woff2", weight: "700", style: "normal" },
    { path: "./tajawal-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "./tajawal-arabic-800-normal.woff2", weight: "800", style: "normal" },
    { path: "./tajawal-latin-800-normal.woff2", weight: "800", style: "normal" },
  ],
});

/** Latin display serif for the guest site. */
export const cormorant = localFont({
  variable: "--font-cormorant",
  display: "swap",
  src: [
    { path: "./cormorant-garamond-latin-300-normal.woff2", weight: "300", style: "normal" },
    { path: "./cormorant-garamond-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./cormorant-garamond-latin-400-italic.woff2", weight: "400", style: "italic" },
    { path: "./cormorant-garamond-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./cormorant-garamond-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
});

/** Arabic display face (Naskh) for the guest site. */
export const amiri = localFont({
  variable: "--font-amiri",
  display: "swap",
  src: [
    { path: "./amiri-arabic-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./amiri-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./amiri-arabic-700-normal.woff2", weight: "700", style: "normal" },
  ],
});
