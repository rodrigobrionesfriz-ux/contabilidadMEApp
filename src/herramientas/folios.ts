// Libros en hojas sueltas foliadas por el SII: traslado de folios-sii.js. No reemplaza la
// autorización del Servicio: administra rangos ya autorizados y compone las páginas sin reutilizar folios.

export const LIBROS: Record<string, string> = { diario: 'Libro Diario', mayor: 'Libro Mayor', caja: 'Libro Caja', inventario: 'Libro de Inventarios y Balances' };
export interface ConfigFolios { papel: 'A4' | 'Carta' | 'Oficio'; orientacion: 'portrait' | 'landscape'; margenSup: number; margenDer: number; margenInf: number; margenIzq: number; lineas: number; orden: 'asc' | 'desc'; mostrarFolio: boolean }
export const CFG_DEFAULT: ConfigFolios = { papel: 'A4', orientacion: 'portrait', margenSup: 30, margenDer: 10, margenInf: 12, margenIzq: 10, lineas: 28, orden: 'asc', mostrarFolio: false };
export function normalizarConfig(c: Partial<ConfigFolios> | null | undefined): ConfigFolios {
  const x = { ...CFG_DEFAULT, ...(c || {}) };
  const mm = (v: unknown, d: number) => (Number.isFinite(+(v as number)) ? Math.max(0, Math.min(80, +(v as number))) : d);
  return {
    papel: ['A4', 'Carta', 'Oficio'].includes(x.papel) ? x.papel : 'A4', orientacion: x.orientacion === 'landscape' ? 'landscape' : 'portrait',
    margenSup: mm(x.margenSup, 30), margenDer: mm(x.margenDer, 10), margenInf: mm(x.margenInf, 12), margenIzq: mm(x.margenIzq, 10),
    lineas: Math.max(16, Math.min(42, Math.round(+x.lineas || 28))), orden: x.orden === 'desc' ? 'desc' : 'asc', mostrarFolio: !!x.mostrarFolio,
  };
}

export type FilaLibro =
  | { tipo: 'mov'; fecha: string; n: number | ''; cuenta: string; glosa: string; debe: number; haber: number }
  | { tipo: 'cuenta'; cd: string; nm: string; saldoAnterior: number }
  | { tipo: 'movMayor'; fecha: string; n: number; glosa: string; debe: number; haber: number; saldo: number }
  | { tipo: 'totalMayor'; debe: number; haber: number; saldo: number }
  | { tipo: 'inv'; cd: string; nm: string; debe: number; haber: number };

export interface AsientoLibro { numero: number; fecha: string; glosa: string; lineas: { cuenta: string; nombre: string; glosa: string | null; debe: number; haber: number }[] }

export function filasDiario(asientos: AsientoLibro[]): FilaLibro[] {
  const out: FilaLibro[] = [];
  for (const e of asientos) {
    let first = true;
    for (const m of e.lineas) {
      out.push({ tipo: 'mov', fecha: first ? e.fecha : '', n: first ? e.numero : '', cuenta: `${m.cuenta} ${m.nombre}`.trim(), glosa: first ? e.glosa : m.glosa || '', debe: +m.debe || 0, haber: +m.haber || 0 });
      first = false;
    }
  }
  return out;
}
/** Libro caja: los movimientos de las cuentas de caja (11011xx). */
export function filasCaja(asientos: AsientoLibro[]): FilaLibro[] {
  const out: FilaLibro[] = [];
  for (const e of asientos) for (const m of e.lineas) {
    if (!m.cuenta.startsWith('11011')) continue;
    out.push({ tipo: 'mov', fecha: e.fecha, n: e.numero, cuenta: `${m.cuenta} ${m.nombre}`.trim(), glosa: e.glosa, debe: +m.debe || 0, haber: +m.haber || 0 });
  }
  return out;
}
export interface CuentaMayor { cd: string; nm: string; saldoAnterior: number; movs: { fecha: string; n: number; glosa: string; debe: number; haber: number }[] }
export function filasMayor(cuentas: CuentaMayor[]): FilaLibro[] {
  const out: FilaLibro[] = [];
  for (const a of [...cuentas].sort((x, y) => x.cd.localeCompare(y.cd))) {
    if (!a.movs.length && Math.abs(a.saldoAnterior || 0) < 0.5) continue;
    out.push({ tipo: 'cuenta', cd: a.cd, nm: a.nm, saldoAnterior: a.saldoAnterior || 0 });
    let s = a.saldoAnterior || 0, d = 0, h = 0;
    for (const m of a.movs) { s += m.debe - m.haber; d += m.debe; h += m.haber; out.push({ tipo: 'movMayor', fecha: m.fecha, n: m.n, glosa: m.glosa, debe: m.debe, haber: m.haber, saldo: s }); }
    out.push({ tipo: 'totalMayor', debe: d, haber: h, saldo: s });
  }
  return out;
}
export function filasInventario(saldos: { cd: string; nm: string; saldo: number }[]): FilaLibro[] {
  return [...saldos].sort((a, b) => a.cd.localeCompare(b.cd)).filter((a) => Math.abs(a.saldo) >= 0.5)
    .map((a) => ({ tipo: 'inv' as const, cd: a.cd, nm: a.nm, debe: a.saldo > 0 ? a.saldo : 0, haber: a.saldo < 0 ? -a.saldo : 0 }));
}
export function paginar<T>(filas: T[], lineas: number): T[][] {
  const pags: T[][] = []; for (let i = 0; i < filas.length; i += lineas) pags.push(filas.slice(i, i + lineas));
  if (!pags.length) pags.push([]); return pags;
}

export interface Rango { id: string; desde: number; hasta: number; activo: boolean; fechaAutorizacion: string | null }
export interface Reserva { id: string; folios: number[]; estado: 'reservado' | 'usado' | 'inutilizado' }
export function estadosPorFolio(reservas: Reserva[]) {
  const m = new Map<number, string>();
  for (const r of reservas) for (const f of r.folios) m.set(+f, r.estado);
  return m;
}
/** Primer bloque de folios consecutivos libres del rango (sólo para la vista previa: la reserva real la hace la base). */
export function siguienteBloque(rango: Rango | null, reservas: Reserva[], cantidad: number) {
  if (!rango) return null;
  const usados = estadosPorFolio(reservas);
  for (let ini = +rango.desde; ini <= +rango.hasta - cantidad + 1; ini++) {
    let ok = true;
    for (let f = ini; f < ini + cantidad; f++) if (usados.has(f)) { ok = false; ini = f; break; }
    if (ok) return Array.from({ length: cantidad }, (_, i) => ini + i);
  }
  return null;
}
export function resumenRango(rango: Rango | null, reservas: Reserva[]) {
  if (!rango) return { total: 0, usados: 0, reservados: 0, inutilizados: 0, libres: 0 };
  const st = estadosPorFolio(reservas); let usados = 0, reservados = 0, inutilizados = 0;
  for (let f = +rango.desde; f <= +rango.hasta; f++) { const e = st.get(f); if (e === 'usado') usados++; else if (e === 'reservado') reservados++; else if (e === 'inutilizado') inutilizados++; }
  const total = +rango.hasta - +rango.desde + 1;
  return { total, usados, reservados, inutilizados, libres: total - usados - reservados - inutilizados };
}
/** Filas del CSV de control (exportarControlFolios). */
export function filasControl(rangos: Rango[], reservas: (Reserva & { libro: string; desde: string; hasta: string; creado: string; usuario: string })[]) {
  const rows: (string | number)[][] = [['Folio', 'Estado', 'Libro', 'Período', 'Fecha reserva', 'Usuario']];
  const por = new Map<number, (typeof reservas)[number]>(); for (const m of reservas) for (const f of m.folios) por.set(+f, m);
  for (const r of rangos) for (let f = +r.desde; f <= +r.hasta; f++) {
    const m = por.get(f);
    rows.push([f, m?.estado || 'disponible', m ? LIBROS[m.libro] : '', m ? `${m.desde} a ${m.hasta}` : '', m?.creado || '', m?.usuario || '']);
  }
  return rows;
}
export const csv = (rows: (string | number)[][]) => '﻿' + rows.map((r) => r.map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
export function tamanoPapel(c: ConfigFolios) {
  const dim = c.papel === 'Carta' ? [216, 279] : c.papel === 'Oficio' ? [216, 356] : [210, 297];
  const [w, h] = c.orientacion === 'landscape' ? [dim[1], dim[0]] : dim;
  return { size: c.papel === 'Carta' ? 'letter' : c.papel === 'Oficio' ? 'legal' : 'A4', w, h };
}
