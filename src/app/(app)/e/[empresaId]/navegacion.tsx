'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Rol } from '@/lib/auth';

type Item = readonly [sub: string, nombre: string, roles?: Rol[]];
const GRUPOS: { titulo: string; items: Item[] }[] = [
  { titulo: '', items: [['', '🏠 Inicio']] },
  {
    titulo: 'Registro',
    items: [
      ['/libro', '🧾 Compras y ventas'],
      ['/rcv', '📥 Importar RCV', ['admin', 'contador']],
      ['/documentos/nuevo', '➕ Nuevo documento', ['admin', 'contador']],
      ['/honorarios', '📝 Honorarios'],
      ['/remuneraciones', '👷 Remuneraciones'],
      ['/activo-fijo', '🏗️ Activo fijo'],
      ['/inventario', '📦 Inventario'],
      ['/asientos/nuevo', '✍️ Nuevo asiento', ['admin', 'contador']],
      ['/diario', '📖 Libro diario'],
    ],
  },
  { titulo: 'Tesorería', items: [['/pagos', '💸 Pagos y cobros', ['admin', 'contador']], ['/auxiliares', '👥 Auxiliares'], ['/conciliacion', '🏦 Conciliación bancaria'], ['/flujo-caja', '💵 Flujo de caja']] },
  { titulo: 'Reportes', items: [['/mayor', '📚 Libro mayor'], ['/balance', '⚖️ Balance 8 columnas'], ['/estados', '📈 Estados financieros'], ['/f29', '🧮 F29 y PPM'], ['/renta', '🧾 Renta anual (F22)'], ['/dj', '📋 Declaraciones juradas'], ['/cierre', '🔒 Cierre del ejercicio']] },
  {
    titulo: 'Herramientas',
    items: [
      ['/asientos/tipo', '📋 Asientos tipo'],
      ['/asignar-cc', '🎯 Asignar centros de costo'],
      ['/iecv', '📤 XML compras y ventas'],
      ['/hojas-foliadas', '📑 Hojas foliadas'],
      ['/exportar', '📊 Exportar a Excel'],
      ['/actividad', '📜 Registro de actividad', ['admin']],
    ],
  },
  {
    titulo: 'Configuración',
    items: [
      ['/plan-cuentas', '📒 Plan de cuentas'],
      ['/centros-costo', '🌳 Centros de costo'],
      ['/empresa', '🏢 Empresa', ['admin']],
      ['/usuarios', '👥 Usuarios', ['admin']],
      ['/importar', '📥 Importar respaldo', ['admin']],
    ],
  },
];

export function Navegacion({ base, rol }: { base: string; rol: Rol }) {
  const ruta = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-borde bg-panel p-2 md:w-56 md:flex-1 md:flex-col md:border-r md:border-b-0">
      {GRUPOS.map((g) => {
        const items = g.items.filter(([, , roles]) => !roles || roles.includes(rol));
        if (!items.length) return null;
        return (
          <div key={g.titulo} className="flex gap-1 md:mb-2 md:flex-col">
            {g.titulo && <div className="hidden px-3 pt-2 pb-1 text-[10px] font-semibold tracking-wider text-tenue uppercase md:block">{g.titulo}</div>}
            {items.map(([sub, nombre]) => {
              const href = base + sub;
              const activo = sub === '' ? ruta === base : ruta.startsWith(href);
              return (
                <Link key={sub} href={href}
                  className={`rounded-md px-3 py-1.5 text-sm whitespace-nowrap ${activo ? 'bg-panel-2 font-medium text-acento' : 'text-tenue hover:bg-panel-2 hover:text-texto'}`}>
                  {nombre}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
