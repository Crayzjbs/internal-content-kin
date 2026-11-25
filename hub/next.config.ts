import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Local personal tool: server code reads and writes files in the repo.
  serverExternalPackages: ["@anthropic-ai/sdk"],
};

export default nextConfig;
