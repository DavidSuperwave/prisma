import nextVitals from "eslint-config-next/core-web-vitals";

const nextConfig = Array.isArray(nextVitals) ? nextVitals : [nextVitals];

export default [
  {
    ignores: [
      ".next/**",
      "prisma/**",
    ],
  },
  ...nextConfig,
];