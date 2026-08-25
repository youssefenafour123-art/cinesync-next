import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `@cinesync/shared` is a workspace package published as TypeScript source
  // rather than a build output, so Next has to compile it like app code.
  // Metro does the same thing on the mobile side without being told.
  transpilePackages: ["@cinesync/shared"],

  /*
     Baseline response headers. The app shipped with none of these.

     Deliberately not a Content-Security-Policy. A useful one here would have
     to allow Google Fonts, TMDB and Metahub images, the Supabase origin and
     GSAP's inline style writes, and a CSP that is wrong is either broken in
     production or so permissive it proves nothing. These four are the ones
     that are correct without knowing anything about the page.
  */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Stops a browser second-guessing a declared Content-Type, which is
          // how a JSON response gets sniffed as HTML and executed.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Nothing here is meant to be framed, and the app holds a logged-in
          // session — the pairing that clickjacking needs.
          { key: "X-Frame-Options", value: "DENY" },
          // The modern equivalent, which unlike the header above understands
          // nested browsing contexts.
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          // Third-party image hosts and TMDB do not need to be told which
          // page someone was on when they were fetched.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // The app asks for none of these; saying so stops an embedded frame
          // or a future dependency asking on its behalf.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
      {
        /*
           The relay carries an authKey and answers per caller. `no-store` is
           set on the response too; this is the belt to that pair of braces,
           and it also covers the error paths that return before it.
        */
        source: "/api/stremio/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
    ];
  },
};

export default nextConfig;
