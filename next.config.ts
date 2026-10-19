import type { NextConfig } from "next";

// App 100% privada (todo depende de la sesión), por eso no usamos cacheComponents:
// no hay shell estático que ganar y obligaría a envolver cada lectura en <Suspense>.
const nextConfig: NextConfig = {
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
