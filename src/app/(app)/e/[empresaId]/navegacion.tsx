'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  ['', '🏠 Inicio'],
  ['/plan-cuentas', '📒 Plan de cuentas'],
  ['/diario', '📖 Libro diario'],
  ['/asientos/nuevo', '✍️ Nuevo asiento'],
] as const;

export function Navegacion({ base }: { base: string }) {
  const ruta = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-borde bg-panel p-2 md:w-56 md:flex-col md:border-r md:border-b-0">
      {ITEMS.map(([sub, nombre]) => {
        const href = base + sub;
        const activo = sub === '' ? ruta === base : ruta.startsWith(href);
        return (
          <Link key={sub} href={href}
            className={`rounded-md px-3 py-2 text-sm whitespace-nowrap ${activo ? 'bg-panel-2 font-medium text-acento' : 'text-tenue hover:bg-panel-2 hover:text-texto'}`}>
            {nombre}
          </Link>
        );
      })}
    </nav>
  );
}
