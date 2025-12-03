import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Ensure environment variables are available at runtime
  env: {
    // These will be available via process.env in API routes
    // Amplify will inject these from environment variables
  },
};

export default nextConfig;
