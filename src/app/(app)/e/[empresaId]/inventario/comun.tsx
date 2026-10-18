'use client';

import type { DatosInventario } from '@/lib/datos/inventario';
import type { CalculoInv, DocCompra } from '@/inventario/motor';

export interface Apoyo { proveedores: { rut: string; nombre: string }[]; facturas: DocCompra[]; centros: { codigo: string; nombre: string }[]; cuentasGasto: { codigo: string; nombre: string }[] }
export type Resultado = { ok: true; mensaje: string; id?: string } | { ok: false; error: string };
export interface Ctx {
  empresaId: string; datos: DatosInventario; apoyo: Apoyo; escribe: boolean; calc: CalculoInv; pendiente: boolean; hoy: string;
  /** Ejecuta una acción del servidor, muestra el mensaje y refresca. Devuelve true si salió bien. */
  run: (fn: () => Promise<Resultado>) => Promise<boolean>;
  avisar: (m: { ok?: string; error?: string }) => void;
  msg: { ok?: string; error?: string };
}

const num = (v: unknown) => (Number.isFinite(+(v as number)) ? +(v as number) : 0);
export const fmt = (v: unknown) => num(v).toLocaleString('es-CL', { maximumFractionDigits: 2 });
export const mon = (v: unknown) => '$' + Math.round(num(v)).toLocaleString('es-CL');
export const fechaCorta = (s: string | null | undefined) => { if (!s) return '–'; const [y, m, d] = String(s).slice(0, 10).split('-'); return y && m && d ? `${d}-${m}-${y}` : String(s); };
export const nombreProducto = (c: Ctx, id: string) => { const p = c.datos.productos.find((x) => x.id === id); return p ? `${p.codigo} · ${p.descripcion}` : id; };
export const nombreBodega = (c: Ctx, id: string | null | undefined) => c.datos.bodegas.find((x) => x.id === id)?.nombre || '–';
export const bodegasActivas = (c: Ctx) => c.datos.bodegas.filter((b) => b.activo !== false);
export const productosDisponibles = (c: Ctx) => c.datos.productos.filter((p) => p.activo !== false && p.inventariable !== false);

export function Badge({ tono = 'ok', children }: { tono?: 'ok' | 'mal' | 'aviso' | 'tenue' | 'info'; children: React.ReactNode }) {
  const t = { ok: 'bg-acento/15 text-acento', mal: 'bg-peligro/15 text-peligro', aviso: 'bg-amber-500/15 text-amber-500', tenue: 'bg-panel-2 text-tenue', info: 'bg-sky-500/15 text-sky-400' }[tono];
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap ${t}`}>{children}</span>;
}
export function Kpi({ lbl, v, aviso }: { lbl: string; v: React.ReactNode; aviso?: boolean }) {
  return <div className={`rounded-md border p-3 ${aviso ? 'border-amber-500/50' : 'border-borde'}`}><div className="text-[10px] tracking-wide text-tenue uppercase">{lbl}</div><div className={`num mt-1 text-lg font-semibold ${aviso ? 'text-amber-500' : ''}`}>{v}</div></div>;
}
export function Vacio({ cols, children }: { cols: number; children: React.ReactNode }) {
  return <tr><td colSpan={cols} className="py-6 text-center text-tenue">{children}</td></tr>;
}
export function OpcionesBodega({ c, todas }: { c: Ctx; todas?: boolean }) {
  return <><option value="">{todas ? 'Todas las bodegas' : 'Seleccione…'}</option>{bodegasActivas(c).map((b) => <option key={b.id} value={b.id}>{b.codigo} · {b.nombre}</option>)}</>;
}
export function OpcionesProducto({ c }: { c: Ctx }) {
  return <><option value="">Seleccione producto…</option>{productosDisponibles(c).map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.descripcion}</option>)}</>;
}
/** Pide un motivo obligatorio (las anulaciones, devoluciones y rechazos lo exigen). */
export function pedirMotivo(texto: string) {
  const m = window.prompt(texto);
  if (m === null) return null;
  if (!m.trim()) { window.alert('Indica el motivo.'); return null; }
  return m.trim();
}
