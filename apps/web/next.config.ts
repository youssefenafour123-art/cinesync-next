import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `@cinesync/shared` is a workspace package published as TypeScript source
  // rather than a build output, so Next has to compile it like app code.
  // Metro does the same thing on the mobile side without being told.
  transpilePackages: ["@cinesync/shared"],
};

export default nextConfig;
