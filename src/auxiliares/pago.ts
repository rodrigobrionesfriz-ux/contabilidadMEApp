// Pago a proveedores/honorarios o cobro a clientes: un asiento con una línea por documento
// en la cuenta auxiliar (con RUT, DTE y folio para ligar el pago) y una línea consolidada de banco/caja.

import type { ItemSaldo, TipoAuxiliar } from './saldos';

export interface SeleccionPago {
  rut: string;
  razon: string;
  item: Pick<ItemSaldo, 'cuenta' | 'tipo_dte' | 'folio' | 'saldo'>;
  monto: number;
}

export interface LineaAsiento {
  cuenta: string; debe: number; haber: number; glosa?: string; rut_auxiliar?: string; tipo_dte?: number; folio?: string;
}

export type ResultadoPago = { ok: true; glosa: string; lineas: LineaAsiento[]; total: number } | { ok: false; errores: string[] };

export function construirPago(tipo: TipoAuxiliar, sel: SeleccionPago[], cuentaPago: string, glosa?: string): ResultadoPago {
  const errores: string[] = [];
  if (!cuentaPago) errores.push('Elige la cuenta de caja o banco.');
  if (!sel.length) errores.push('Selecciona al menos un documento.');
  const lineas: LineaAsiento[] = [];
  let total = 0;
  for (const s of sel) {
    const monto = Math.round(s.monto);
    const etiqueta = `${s.item.tipo_dte ?? ''} N° ${s.item.folio ?? ''}`.trim();
    if (!(monto > 0)) { errores.push(`${etiqueta}: el monto debe ser mayor que cero.`); continue; }
    if (monto > Math.round(s.item.saldo) + 1) { errores.push(`${etiqueta}: el monto ${monto} supera el saldo ${Math.round(s.item.saldo)}.`); continue; }
    if (!s.item.folio) { errores.push(`${s.razon}: sólo se pagan documentos con folio.`); continue; }
    total += monto;
    const desc = `${s.razon} · DTE ${s.item.tipo_dte} N°${s.item.folio}`.trim();
    const base = { cuenta: s.item.cuenta, glosa: desc, rut_auxiliar: s.rut, tipo_dte: s.item.tipo_dte ?? undefined, folio: s.item.folio };
    lineas.push(tipo === 'cliente' ? { ...base, debe: 0, haber: monto } : { ...base, debe: monto, haber: 0 });
  }
  if (errores.length) return { ok: false, errores };
  const n = sel.length;
  const nombre = tipo === 'cliente' ? 'Cobro a clientes' : tipo === 'honorario' ? 'Pago de honorarios' : 'Pago a proveedores';
  const desc = `${n} ${tipo === 'cliente' ? 'cobro' : 'pago'}${n === 1 ? '' : 's'}`;
  lineas.push(tipo === 'cliente' ? { cuenta: cuentaPago, debe: total, haber: 0, glosa: desc } : { cuenta: cuentaPago, debe: 0, haber: total, glosa: desc });
  return { ok: true, total, lineas, glosa: glosa?.trim() || `${nombre} — ${n} documento${n === 1 ? '' : 's'}` };
}
