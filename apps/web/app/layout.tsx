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

/**
 * Where this deployment lives, for the URLs that have to be absolute.
 *
 * A social card is fetched by Twitter or Discord, not by the visitor's
 * browser, so a relative path is useless to them — Next resolves it against
 * `metadataBase`, and the fallback was `http://localhost:3000`. Nobody had set
 * `NEXT_PUBLIC_SITE_URL` in production, so the live page has been advertising
 * an image on the sharer's own machine and every share has been a blank card.
 *
 * `VERCEL_PROJECT_PRODUCTION_URL` is set by the platform at build time and is
 * the production hostname whichever deployment is building, so the honest
 * default is the one that needs no dashboard setting to be right.
 */
export const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

const DESCRIPTION =
  "Discover movies and anime, then sync your IMDb watchlist straight into your Stremio library.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
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
  // One canonical address for a single-page app that is reached by several.
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: "#050505",
  width: "device-width",
  initialScale: 1,
};

/*
   Only the origin, never the key — this is a hostname to shake hands with,
   and it is already public in every request the browser makes anyway.
*/
const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  : null;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${outfit.variable} antialiased`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/*
           The three origins every screen in this app fetches from, opened
           while the HTML is still parsing.

           Posters are the page's largest paint and they come from TMDB and
           Metahub; the session, lists and top fives come from Supabase. Each
           of those is a DNS lookup, a TCP handshake and a TLS negotiation the
           browser would otherwise start only when the first request is
           queued — which for a poster is after layout.
        */}
        <link rel="preconnect" href="https://image.tmdb.org" />
        <link rel="preconnect" href="https://images.metahub.space" />
        {supabaseOrigin ? <link rel="preconnect" href={supabaseOrigin} /> : null}
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
