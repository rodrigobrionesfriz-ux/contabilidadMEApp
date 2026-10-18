// Conversión entre las filas de la base (snake_case) y los objetos del motor (camelCase).
import type { LineaMov, LineaOC, LineaRecepcion, LineaToma, TipoMov } from './motor';

export interface GrupoI { id: string; nombre: string; subgrupos: string[]; activo: boolean }
export interface BodegaI { id: string; codigo: string; nombre: string; direccion: string; activo: boolean }
export interface ProductoI {
  id: string; codigo: string; ean: string; descripcion: string; tipo: string; unidad: string; grupoId: string | null; subgrupo: string;
  stockMinimo: number; cuentaInventario: string; cuentaCosto: string; aplicaIVA: boolean; manejaLotes: boolean; inventariable: boolean; activo: boolean;
}
export interface MovimientoI {
  id: string; folio: string; tipo: TipoMov; fecha: string; motivo: string; bodegaOrigenId: string | null; bodegaDestinoId: string | null;
  tercero: string; documentoTipo: string; documentoNumero: string; documento: string; proveedorRut: string; proveedorNombre: string;
  ordenCompraId: string | null; recepcionId: string | null; tomaId: string | null; centroCosto: string; observaciones: string; lineas: LineaMov[];
  estado: string; motivoAnulacion: string | null; anulado: string | null; anuladoPor: string; creado: string; creadoPor: string; editado: string | null; editadoPor: string;
}
export interface OrdenCompraI {
  id: string; folio: string; fecha: string; fechaEntrega: string | null; proveedorRut: string; proveedorNombre: string; bodegaId: string; centroCosto: string;
  condicionPago: string; observaciones: string; tasaIVA: number; lineas: LineaOC[]; estado: string; version: number; motivoAnulacion: string | null;
  creado: string; creadoPor: string; modificado: string | null; modificadoPor: string;
}
export interface RecepcionI {
  id: string; folio: string; ordenCompraId: string; proveedorRut: string; proveedorNombre: string; bodegaId: string; fecha: string; documentoTipo: string;
  tipoDTE: number | null; documentoNumero: string; estadoContable: string; compraId: string | null; conciliadoManual: boolean; observaciones: string;
  lineas: LineaRecepcion[]; estado: string; motivoAnulacion: string | null; creado: string; creadoPor: string;
}
export interface TomaI {
  id: string; folio: string; bodegaId: string; alcance: string; grupoId: string | null; observaciones: string; estado: string; version: number; lineas: LineaToma[];
  motivo: string; movimientosAjuste: string[]; creado: string; creadoPor: string; cerrado: string | null; cerradoPor: string; resuelto: string | null; resueltoPor: string;
}

const ESPECIALES: Record<string, string> = { aplica_iva: 'aplicaIVA', tasa_iva: 'tasaIVA', tipo_dte: 'tipoDTE' };
const INVERSO = Object.fromEntries(Object.entries(ESPECIALES).map(([a, b]) => [b, a]));
const NUMERICOS = new Set(['stockMinimo', 'tasaIVA', 'version', 'tipoDTE']);
const FECHAS = new Set(['fecha', 'fechaEntrega']);

/** Fila de la base → objeto del motor. */
export function aCamel<T>(fila: Record<string, unknown>): T {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fila)) {
    if (k === 'empresa_id') continue;
    const c = ESPECIALES[k] || k.replace(/_([a-z])/g, (_, x: string) => x.toUpperCase());
    o[c] = v != null && NUMERICOS.has(c) ? Number(v) : v != null && FECHAS.has(c) ? String(v).slice(0, 10) : v;
  }
  return o as T;
}
/** Objeto del motor → fila de la base (sólo las claves dadas). */
export function aSnake(o: Record<string, unknown>, claves?: string[]): Record<string, unknown> {
  const f: Record<string, unknown> = {};
  for (const k of claves || Object.keys(o)) {
    if (!(k in o)) continue;
    f[INVERSO[k] || k.replace(/[A-Z]/g, (x) => '_' + x.toLowerCase())] = o[k];
  }
  return f;
}
