import type { Metadata, Viewport } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-outfit",
  display: "swap",
});

const DESCRIPTION =
  "Discover movies and anime, then sync your IMDb watchlist straight into your Stremio library.";

export const metadata: Metadata = {
  // Without this the social card in app/opengraph-image.png resolves against
  // localhost. Set NEXT_PUBLIC_SITE_URL when deploying.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "CineSync — IMDb to Stremio",
  description: DESCRIPTION,
  applicationName: "CineSync",
  openGraph: {
    title: "CineSync — IMDb to Stremio",
    description: DESCRIPTION,
    siteName: "CineSync",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "CineSync", description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: "#050505",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${outfit.variable} antialiased`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/*
          Material Symbols isn't in next/font/google's registry (it excludes icon
          fonts), and Tailwind v4 inlines its own @import ahead of anything added
          to globals.css — which puts a url() import past the point browsers
          still honour it. A link tag is the one place this reliably loads.

          `display=block` matters: the font is ligature-based, so an icon's glyph
          name IS its text content. With `swap` the raw word "account_circle"
          flashes on screen before the font arrives.

          The lint rule below targets `pages/_document.js`; this is the App
          Router, where a <link> in the root layout is the documented approach.
        */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font, @next/next/google-font-display */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
        />
      </head>
      <body className="bg-background text-on-surface font-body-md text-body-md overflow-x-hidden">
        {children}
      </body>
    </html>
  );
}
