import type { NextConfig } from "next";
import pkg from "./package.json";

// Identifica cada despliegue: la app compara el suyo con el del servidor para avisar que hay una versión nueva
const BUILD_ID = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7) || Date.now().toString(36);

// App 100% privada (todo depende de la sesión), por eso no usamos cacheComponents:
// no hay shell estático que ganar y obligaría a envolver cada lectura en <Suspense>.
const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_BUILD_ID: BUILD_ID,
    NEXT_PUBLIC_BUILD_FECHA: new Date().toISOString(),
  },
  // El RCV leído (con el registro SII completo de cada documento) se guarda con una acción del servidor
  experimental: { serverActions: { bodySizeLimit: '4mb' } },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
