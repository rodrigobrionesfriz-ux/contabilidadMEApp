import type { MetadataRoute } from 'next';

// Permite instalar la app (Chrome/Edge: botón ⊕ "Instalar" en la barra de direcciones; Android: "Agregar a inicio").
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Contabilidad ME',
    short_name: 'Contabilidad ME',
    description: 'Contabilidad multiempresa: libros, RCV, remuneraciones, F29 y estados financieros.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0d1117',
    theme_color: '#1f7d5a',
    lang: 'es-CL',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
