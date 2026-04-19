import { createRequire } from "module";

const require = createRequire(import.meta.url);

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "placehold.co"
      }
    ]
  },
  // pdf-parse / pdfjs-dist ship a worker file they resolve by URL at runtime.
  // Letting Next (Turbopack or webpack) try to bundle them into the server
  // chunks breaks that resolution, producing:
  //   "Setting up fake worker failed: Cannot find module '.../pdf.worker.mjs'"
  // Treating them as external forces Node's CommonJS/ESM loader to resolve
  // them from node_modules at runtime, where the worker file exists.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@dnd-kit/utilities"
    ]
  }
};

const withAnalyzer = (config) => {
  if (process.env.ANALYZE !== "1" && process.env.ANALYZE !== "true") {
    return config;
  }
  try {
    const createBundleAnalyzer = require("@next/bundle-analyzer");
    return createBundleAnalyzer({ enabled: true })(config);
  } catch {
    console.warn(
      "[next.config] ANALYZE=1 set but @next/bundle-analyzer is not installed; skipping analyzer."
    );
    return config;
  }
};

export default withAnalyzer(nextConfig);
