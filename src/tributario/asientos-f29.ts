// Asientos derivados del F29 (traslado de calcularCompensacionIVA y del pago F29 del sistema actual).

import type { MesF29 } from './f29';
import { MESES } from '@/lib/formato';

export const CUENTAS_COMPENSACION = {
  debito: '2103003', ivaRetenido: '2103005', credito: '1108002', creditoActivoFijo: '1108008',
  remanente: '1108007', porPagar: '2104002', reajuste: '3501001', ppmActivo: '1108001', ppmPasivo: '2105006',
};
export const CUENTA_REMANENTE = { codigo: '1108007', nombre: 'REMANENTE CRÉDITO FISCAL', tipo: 'A', naturaleza: 'D' };

export interface LineaF29 { cuenta: string; debe: number; haber: number; glosa: string }

/** Línea con el monto en su lado; un monto negativo pasa al lado contrario. */
function linea(cuenta: string, monto: number, lado: 'debe' | 'haber', glosa: string): LineaF29 | null {
  const v = Math.round(monto);
  if (!v) return null;
  const alDebe = (lado === 'debe') === v > 0;
  return { cuenta, debe: alDebe ? Math.abs(v) : 0, haber: alDebe ? 0 : Math.abs(v), glosa };
}

export function compensacionIVA(d: MesF29, anio: number, incluirPPM: boolean, c = CUENTAS_COMPENSACION) {
  const per = `${MESES[d.m - 1]} ${anio}`;
  const remanenteNuevo = d.remanente;
  const deltaRem = remanenteNuevo - d.remanenteAnt;
  const reajuste = d.reajusteRemanente;
  const lineas = [
    linea(c.debito, d.debito, 'debe', `Débito fiscal ventas ${per} (F29 cód. 538)`),
    linea(c.ivaRetenido, d.ivaRetenido, 'debe', `IVA retenido facturas de compra ${per} (DTE 45/46)`),
    linea(c.credito, d.credito, 'haber', `Crédito fiscal ${per} (F29 cód. 520)`),
    linea(c.creditoActivoFijo, d.creditoActivoFijo, 'haber', `Crédito fiscal activo fijo ${per} (F29 cód. 525)`),
    linea(c.reajuste, reajuste, 'haber', `Reajuste remanente art. 27 DL 825 (UTM ${d.utmRemanenteAnt} → ${d.utmImputacion})`),
    deltaRem > 0 ? linea(c.remanente, deltaRem, 'debe', `Remanente crédito fiscal ${per} (F29 cód. 77)`)
      : linea(c.remanente, -deltaRem, 'haber', `Imputación remanente mes anterior (F29 cód. 504)`),
    linea(c.porPagar, d.ivaAPagar, 'haber', `IVA a pagar ${per} (F29 cód. 89)`),
    ...(incluirPPM && d.ppm > 0 ? [linea(c.ppmActivo, d.ppm, 'debe', `PPM ${per} (F29 cód. 62)`), linea(c.ppmPasivo, d.ppm, 'haber', `PPM por pagar ${per}`)] : []),
  ].filter((x): x is LineaF29 => !!x);
  const tD = lineas.reduce((s, l) => s + l.debe, 0), tH = lineas.reduce((s, l) => s + l.haber, 0);
  return { lineas, cuadra: tD === tH, glosa: `Compensación IVA ${per} — F29`, ivaAPagar: d.ivaAPagar, remanenteNuevo };
}

export const CONCEPTOS_PAGO = [
  { k: 'iva', lbl: 'IVA determinado a pagar', cod: 89, cuenta: '2104002' },
  { k: 'ppm', lbl: 'PPM primera categoría', cod: 62, cuenta: '1108001' },
  { k: 'honorarios', lbl: 'Retención boletas de honorarios', cod: 151, cuenta: '2103002' },
  { k: 'iusc', lbl: 'Impuesto único de segunda categoría', cod: 48, cuenta: '2104002' },
  { k: 'multas', lbl: 'Multas, reajustes e intereses', cod: 0, cuenta: '3403001' },
] as const;
export type ConceptoPago = (typeof CONCEPTOS_PAGO)[number]['k'];

/** Montos sugeridos: lo declarado si el período está presentado; si no, lo calculado. */
export function montosSugeridos(d: MesF29): Record<ConceptoPago, number> {
  const decl = d.declaracion?.estado === 'presentado' ? d.declaracion.declarado ?? {} : {};
  const v = (cod: number, calc: number) => (decl[String(cod)] != null ? +decl[String(cod)] : calc);
  // El anticipo de cambio de sujeto imputado (cód. 598) rebaja el IVA a enterar
  return { iva: Math.max(0, v(89, d.ivaAPagar) - v(598, d.codigos[598] ?? 0)), ppm: v(62, d.ppm), honorarios: v(151, d.retencionHon), iusc: v(48, d.iusc), multas: 0 };
}

export function pagoF29(d: MesF29, anio: number, montos: Partial<Record<ConceptoPago, number>>, cuentaBanco: string, cuentas: Partial<Record<ConceptoPago, string>> = {}) {
  const per = `${MESES[d.m - 1]} ${anio}`;
  const lineas: LineaF29[] = [];
  for (const c of CONCEPTOS_PAGO) {
    const m = Math.round(montos[c.k] ?? 0);
    if (m > 0) lineas.push({ cuenta: cuentas[c.k] || c.cuenta, debe: m, haber: 0, glosa: `${c.lbl} ${per}${c.cod ? ` (cód. ${c.cod})` : ''}` });
  }
  const total = lineas.reduce((s, l) => s + l.debe, 0);
  if (total > 0) lineas.push({ cuenta: cuentaBanco, debe: 0, haber: total, glosa: `Pago F29 ${per}` });
  return { lineas, total, glosa: `Pago F29 ${per}` };
}

/** Fecha legal de pago: día 12 del mes siguiente (declaración en papel; electrónica hasta el 20). */
export function fechaPagoSugerida(anio: number, mes: number) {
  const y = mes === 12 ? anio + 1 : anio, m = mes === 12 ? 1 : mes + 1;
  return `${y}-${String(m).padStart(2, '0')}-12`;
}
