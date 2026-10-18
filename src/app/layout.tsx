import type { Metadata } from 'next';
// Fuentes empaquetadas (sin depender de Google Fonts en tiempo de build)
import '@fontsource-variable/sora';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Contabilidad ME', template: '%s · Contabilidad ME' },
  description: 'Sistema contable multiempresa',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es-CL" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
