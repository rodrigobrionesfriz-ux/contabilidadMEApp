import type { Metadata } from 'next';
// Fuentes empaquetadas (sin depender de Google Fonts en tiempo de build)
import '@fontsource-variable/sora';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';
import './globals.css';
import { SCRIPT_TEMA } from '@/lib/tema';

export const metadata: Metadata = {
  title: { default: 'Contabilidad ME', template: '%s · Contabilidad ME' },
  description: 'Sistema contable multiempresa',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // suppressHydrationWarning: el script de <head> agrega data-theme antes de que React hidrate
    <html lang="es-CL" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
