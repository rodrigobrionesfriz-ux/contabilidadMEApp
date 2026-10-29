'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import type { Rol } from '@/lib/auth';
import { moduloDeRuta, type Permiso } from '@/lib/modulos';

/**
 * Barra lateral con la misma agrupación y orden que el sistema actual.
 * `q` fija parámetros de la URL que distinguen ítems de una misma página
 * (ventas y compras, balance y resultados); `def` es su valor por defecto.
 * Una ruta que parte con «/» y sin base (absoluta) sale de la empresa.
 */
interface Item { ruta: string; nombre: string; icono: string; roles?: Rol[]; q?: Record<string, string>; def?: Record<string, string>; absoluta?: boolean; exacta?: boolean }
interface Grupo { id: string; titulo: string; icono: string; items: Item[] }

const ESCRIBE: Rol[] = ['admin', 'contador'];
const GRUPOS: Grupo[] = [
  {
    id: 'registros', titulo: 'Registros', icono: '🗂️', items: [
      { ruta: '/libro', nombre: 'Libro de Ventas', icono: '🛒', q: { tipo: 'venta' }, def: { tipo: 'compra' } },
      { ruta: '/libro', nombre: 'Libro de Compras', icono: '🧾', q: { tipo: 'compra' }, def: { tipo: 'compra' } },
      { ruta: '/rcv', nombre: 'Importar RCV', icono: '📥', roles: ESCRIBE },
      { ruta: '/documentos/nuevo', nombre: 'Nuevo documento', icono: '➕', roles: ESCRIBE },
      { ruta: '/honorarios', nombre: 'Honorarios', icono: '📝' },
      { ruta: '/remuneraciones', nombre: 'Remuneraciones', icono: '👷' },
      { ruta: '/pagos', nombre: 'Pagos y Cobros', icono: '💳', roles: ESCRIBE },
      { ruta: '/fichas', nombre: 'Proveedores y Clientes', icono: '📇' },
      { ruta: '/auxiliares', nombre: 'Auxiliares', icono: '📒' },
      { ruta: '/asientos/nuevo', nombre: 'Comprobantes', icono: '📔', roles: ESCRIBE },
      { ruta: '/asientos', nombre: 'Buscar comprobantes', icono: '🔎', exacta: true },
      { ruta: '/asientos/tipo', nombre: 'Asientos tipo', icono: '📋' },
    ],
  },
  { id: 'inventario', titulo: 'Inventario', icono: '📦', items: [{ ruta: '/inventario', nombre: 'Control de Inventario', icono: '📦' }] },
  {
    id: 'reportes', titulo: 'Reportes', icono: '📚', items: [
      { ruta: '/diario', nombre: 'Libro Diario', icono: '📖' },
      { ruta: '/iecv', nombre: 'Libros Compra y Venta', icono: '📚' },
      { ruta: '/hojas-foliadas', nombre: 'Hojas foliadas SII', icono: '🖨️' },
      { ruta: '/mayor', nombre: 'Libro Mayor', icono: '📊' },
      { ruta: '/estados', nombre: 'Balance General', icono: '⚖️', q: { vista: 'balance' }, def: { vista: 'balance' } },
      { ruta: '/estados', nombre: 'Resultados', icono: '📈', q: { vista: 'resultados' }, def: { vista: 'balance' } },
      { ruta: '/balance', nombre: 'Balance 8 columnas', icono: '📋' },
      { ruta: '/flujo-caja', nombre: 'Flujo de Caja', icono: '💵' },
      { ruta: '/conciliacion', nombre: 'Conciliación Bancaria', icono: '🏦' },
    ],
  },
  {
    id: 'tributario', titulo: 'Tributario SII', icono: '🏛️', items: [
      { ruta: '/f29', nombre: 'Formulario 29 y PPM', icono: '📄' },
      { ruta: '/renta', nombre: 'Declaración de Renta', icono: '🧾' },
      { ruta: '/dj', nombre: 'Declaraciones Juradas', icono: '📋' },
    ],
  },
  { id: 'activos', titulo: 'Activo Fijo', icono: '🏗️', items: [{ ruta: '/activo-fijo', nombre: 'Activos Fijos', icono: '🏗️' }] },
  { id: 'cierre', titulo: 'Cierre de Ejercicio', icono: '🔐', items: [{ ruta: '/cierre', nombre: 'Cierre del Ejercicio', icono: '🔒' }] },
  {
    id: 'configuracion', titulo: 'Configuración', icono: '⚙️', items: [
      { ruta: '/empresas', nombre: 'Empresas', icono: '🏢', absoluta: true },
      { ruta: '/primeros-pasos', nombre: 'Primeros pasos', icono: '🚀' },
      { ruta: '/empresa', nombre: 'Empresa', icono: '🏢', roles: ['admin'] },
      { ruta: '/centros-costo', nombre: 'Centros de Costo', icono: '📊' },
      { ruta: '/asignar-cc', nombre: 'Asignar Centros de Costo', icono: '🎯' },
      { ruta: '/plan-cuentas', nombre: 'Plan de Cuentas', icono: '📋' },
      { ruta: '/apertura', nombre: 'Balance de Apertura', icono: '🏁' },
      { ruta: '/importar', nombre: 'Importar respaldo', icono: '📥', roles: ['admin'] },
      { ruta: '/exportar', nombre: 'Exportar a Excel', icono: '📊' },
      { ruta: '/usuarios', nombre: 'Usuarios', icono: '👥', roles: ['admin'] },
      { ruta: '/actividad', nombre: 'Registro de Actividad', icono: '📜', roles: ['admin'] },
    ],
  },
];

const hrefDe = (base: string, it: Item) => (it.absoluta ? it.ruta : base + it.ruta) + (it.q ? '?' + new URLSearchParams(it.q).toString() : '');

/** Cambia el año contable (cookie común a todas las empresas) y, si la página tiene ?anio=, lo reemplaza. */
function SelectorAnio({ anio }: { anio: number }) {
  const router = useRouter();
  const ruta = usePathname();
  const sp = useSearchParams();
  const actual = Number(sp.get('anio')) || anio;
  const hoy = new Date().getFullYear();
  const anios = Array.from({ length: 9 }, (_, i) => hoy + 1 - i);
  if (!anios.includes(actual)) anios.push(actual);
  return (
    <select aria-label="Año contable" value={actual} className="campo num w-24 py-1 text-sm"
      onChange={(e) => {
        const a = e.target.value;
        document.cookie = `anio_contable=${a}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
        const q = new URLSearchParams(sp.toString());
        if (q.has('anio')) q.set('anio', a);
        q.delete('mes');
        router.push(q.toString() ? `${ruta}?${q}` : ruta);
        router.refresh();
      }}>
      {anios.sort((x, y) => y - x).map((y) => <option key={y} value={y}>{y}</option>)}
    </select>
  );
}

/** Cambia de empresa quedándose en la misma sección (sin ids propios de la empresa anterior). */
function SelectorEmpresa({ empresaId, empresas }: { empresaId: string; empresas: { id: string; nombre: string; rut: string }[] }) {
  const router = useRouter();
  const ruta = usePathname();
  const sp = useSearchParams();
  return (
    <select aria-label="Empresa" value={empresaId} className="campo w-full truncate py-1 text-sm font-medium"
      onChange={(e) => {
        const resto = ruta.slice(`/e/${empresaId}`.length).split('/').filter(Boolean);
        // Sección (y subsección sin ids, p. ej. remuneraciones/parametros); un id (uuid o número) no se lleva
        const sinId = resto.slice(0, 2).filter((x, i) => i === 0 || !/^[0-9a-f-]{8,}$|^\d+$|^nuevo$/i.test(x));
        const q = new URLSearchParams(sp.toString());
        ['id', 'doc', 'n'].forEach((k) => q.delete(k));
        router.push(`/e/${e.target.value}${sinId.length ? '/' + sinId.join('/') : ''}${q.toString() ? `?${q}` : ''}`);
      }}>
      {empresas.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
    </select>
  );
}

export function Navegacion({ base, rol, empresa, buscador, empresaId, empresas, anio, permisos }: {
  base: string; rol: Rol; empresa: string; buscador: React.ReactNode;
  empresaId: string; empresas: { id: string; nombre: string; rut: string }[]; anio: number;
  /** Permiso por módulo del perfil de acceso: los módulos sin acceso no aparecen */
  permisos: Record<string, Permiso>;
}) {
  const ruta = usePathname();
  const sp = useSearchParams();
  const [abierto, setAbierto] = useState(false);
  // Grupos abiertos o cerrados a mano; si no se tocó, se abre el que contiene la página actual.
  const [manual, setManual] = useState<Record<string, boolean>>({});

  const esActivo = (it: Item) => {
    const camino = it.absoluta ? it.ruta : base + it.ruta;
    if (!(ruta === camino || (!it.exacta && ruta.startsWith(camino + '/')))) return false;
    return Object.entries(it.q || {}).every(([k, v]) => (sp.get(k) || it.def?.[k]) === v);
  };
  const conAcceso = (it: Item) => { const m = it.absoluta ? null : moduloDeRuta(base + it.ruta); return !m || permisos[m] !== 'no'; };
  const grupos = GRUPOS.map((g) => ({ ...g, items: g.items.filter((it) => (!it.roles || it.roles.includes(rol)) && conAcceso(it)) })).filter((g) => g.items.length);
  const enInicio = ruta === base;
  const actual = grupos.flatMap((g) => g.items).find(esActivo);
  const cerrar = () => setAbierto(false);

  const claseItem = (activo: boolean) =>
    `flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm ${activo ? 'bg-panel-2 font-medium text-acento' : 'text-tenue hover:bg-panel-2 hover:text-texto'}`;

  return (
    <>
      {/* Celular: barra con el botón de menú y la sección actual */}
      <div className="no-print flex items-center gap-2 border-b border-borde bg-panel px-3 py-2 md:hidden">
        <button type="button" className="boton-sec px-2.5" onClick={() => setAbierto(true)} aria-label="Abrir menú" aria-expanded={abierto}>☰</button>
        <span className="truncate text-sm text-tenue">{enInicio ? '🏠 Inicio' : actual ? `${actual.icono} ${actual.nombre}` : ''}</span>
      </div>
      {abierto && <div className="no-print fixed inset-0 z-40 bg-velo md:hidden" onClick={cerrar} aria-hidden />}

      <aside
        className={`no-print fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-borde bg-panel transition-transform md:sticky md:top-0 md:z-auto md:h-[calc(100dvh-3.5rem)] md:w-60 md:max-w-none md:translate-x-0 ${abierto ? 'translate-x-0' : '-translate-x-full'}`}
        aria-label="Menú principal">
        <div className="flex items-start justify-between gap-2 border-b border-borde px-4 py-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <div className="text-[10px] font-semibold tracking-wider text-tenue uppercase">Empresa activa</div>
              {empresas.length > 1 ? <SelectorEmpresa empresaId={empresaId} empresas={empresas} />
                : <div className="truncate text-sm font-medium" title={empresa}>{empresa}</div>}
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] font-semibold tracking-wider text-tenue uppercase">Año contable</div>
              <SelectorAnio anio={anio} />
            </div>
          </div>
          <button type="button" className="text-lg text-tenue hover:text-texto md:hidden" onClick={cerrar} aria-label="Cerrar menú">✕</button>
        </div>
        <div className="border-b border-borde p-2">{buscador}</div>
        <nav className="flex-1 overflow-y-auto p-2">
          <Link href={base} onClick={cerrar} className={claseItem(enInicio)}><span>🏠</span>Inicio</Link>
          {grupos.map((g) => {
            const tieneActivo = g.items.some(esActivo);
            const abiertoG = manual[g.id] ?? tieneActivo;
            return (
              <div key={g.id} className="mt-1">
                <button type="button" onClick={() => setManual((m) => ({ ...m, [g.id]: !abiertoG }))} aria-expanded={abiertoG}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[13px] font-semibold ${tieneActivo ? 'text-texto' : 'text-tenue hover:text-texto'}`}>
                  <span className="flex items-center gap-2.5"><span>{g.icono}</span>{g.titulo}</span>
                  <span className={`text-tenue transition-transform ${abiertoG ? 'rotate-90' : ''}`}>›</span>
                </button>
                {abiertoG && (
                  <div className="mb-1 ml-3 border-l border-borde pl-1">
                    {g.items.map((it) => (
                      <Link key={it.nombre} href={hrefDe(base, it)} onClick={cerrar} className={claseItem(esActivo(it))}>
                        <span>{it.icono}</span>{it.nombre}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
