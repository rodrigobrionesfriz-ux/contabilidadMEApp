// Documento de una línea de asiento manual con cuenta de auxiliar (proveedor, cliente u honorarios).
// "nuevo": se registra en el libro (compras, ventas u honorarios) con los mismos datos que se capturan del RCV;
// "existente": la línea sólo referencia un documento ya registrado (pagos, abonos, cruces).

import { DTE_COMPRAS, DTE_VENTAS, IVA, dteC, dteV } from '@/motor/dte';
import { rutParse } from '@/motor/rut';
import { sumarDiasFechaISO, type DocRCV } from '@/rcv/leer';
import { retencionHonorarios } from '@/importador/respaldo';

export type TipoAux = 'proveedor' | 'cliente' | 'honorario';
export const esTipoDoc = (t: string | null | undefined): t is TipoAux => t === 'proveedor' || t === 'cliente' || t === 'honorario';
export const TIPO_LIBRO: Record<TipoAux, 'compra' | 'venta' | 'honorario'> = { proveedor: 'compra', cliente: 'venta', honorario: 'honorario' };

export interface DocAux {
  modo: 'nuevo' | 'existente';
  rut: string; razon: string; tipoDTE: number; folio: string;
  fecha: string; vence: string; periodo: string;
  exento: number; neto: number; iva: number; ivaManual: boolean; otros: number;
  /** Honorarios */
  bruto: number; conRetencion: boolean;
}

export const dtesDe = (t: TipoAux) => t === 'cliente' ? DTE_VENTAS : t === 'honorario' ? DTE_COMPRAS.filter((d) => d.honorario) : DTE_COMPRAS.filter((d) => !d.honorario);

export function docVacio(t: TipoAux, fecha: string, modo: DocAux['modo'] = 'nuevo'): DocAux {
  return { modo, rut: '', razon: '', tipoDTE: t === 'honorario' ? 70 : 33, folio: '', fecha, vence: '', periodo: fecha.slice(0, 7),
    exento: 0, neto: 0, iva: 0, ivaManual: false, otros: 0, bruto: 0, conRetencion: true };
}

/** Montos del documento y lo que debería ir en la línea del auxiliar. */
export function totalesDoc(t: TipoAux, d: DocAux) {
  if (t === 'honorario') {
    const conRet = d.tipoDTE === 70;
    const tasa = conRet ? retencionHonorarios(+d.fecha.slice(0, 4) || new Date().getFullYear()) : 0;
    const retencion = Math.round(d.bruto * tasa);
    return { iva: 0, total: d.bruto, retencion, tasa, liquido: d.bruto - retencion, montoLinea: d.bruto - retencion, ivaRetenido: 0 };
  }
  const info = t === 'cliente' ? dteV(d.tipoDTE) : dteC(d.tipoDTE);
  const afecto = info?.afecto !== false;
  const iva = d.ivaManual ? d.iva : afecto ? Math.round(d.neto * IVA) : 0;
  const retieneIVA = t === 'proveedor' && (d.tipoDTE === 45 || d.tipoDTE === 46);
  const total = d.exento + d.neto + (retieneIVA ? 0 : iva) + d.otros;
  return { iva, total, retencion: 0, tasa: 0, liquido: total, montoLinea: total, ivaRetenido: retieneIVA ? iva : 0 };
}

/** Lado esperado de la línea: proveedor/honorarios al haber (nota de crédito al debe); cliente al debe (NC al haber). */
export function ladoLinea(t: TipoAux, tipoDTE: number): 'debe' | 'haber' {
  const nc = tipoDTE === 61;
  if (t === 'cliente') return nc ? 'haber' : 'debe';
  return nc ? 'debe' : 'haber';
}

export function validarDocAux(t: TipoAux, d: DocAux): string[] {
  const e: string[] = [];
  if (!rutParse(d.rut).valido) e.push('RUT no válido');
  if (!String(d.folio).trim()) e.push('Falta el folio');
  if (!dtesDe(t).some((x) => x.cod === +d.tipoDTE)) e.push('Tipo de documento no válido');
  if (d.modo === 'existente') return e;
  if (!d.razon.trim()) e.push(t === 'honorario' ? 'Falta el nombre del prestador' : 'Falta la razón social');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) e.push('Fecha del documento no válida');
  if (t === 'honorario') { if (!(d.bruto > 0)) e.push('El monto bruto debe ser mayor que cero'); }
  else {
    if (!(totalesDoc(t, d).total > 0)) e.push('El total del documento debe ser mayor que cero');
    if (t === 'proveedor' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(d.periodo)) e.push('Período contable no válido');
  }
  return e;
}

/** Documento con la forma del RCV (compras y ventas), igual al de "Nuevo documento". */
export function docRCVDesde(t: 'proveedor' | 'cliente', d: DocAux): DocRCV {
  const r = rutParse(d.rut);
  const x = totalesDoc(t, d);
  return {
    fecha: d.fecha, fechaVencimiento: d.vence || sumarDiasFechaISO(d.fecha, 30), fechaVencimientoOrigen: d.vence ? 'manual' : 'estimado30d',
    fechaRecepcionSII: '', fechaAcuseSII: '', tipoDTE: +d.tipoDTE, numero: String(d.folio).trim(),
    rutCodigo: r.codigo, rutDV: r.dv, razonSocial: d.razon.trim(),
    neto: d.neto, exento: d.exento, iva: x.iva, tratamientoIVA: 'recuperable',
    otrosImpuestos: d.otros, tratamientoOtrosImpuestos: 'costo', otrosImpuestosDetalle: [], total: x.total, netoAF: 0,
    ...(x.ivaRetenido ? { ivaRetenido: x.ivaRetenido, totalSII: x.total, totalIncluyeRetencion: false } : {}),
  };
}

/** RUT con formato de la base ("12345678-9"). */
export const rutBase = (rut: string) => { const r = rutParse(rut); return r.valido ? `${r.codigo}-${r.dv}` : rut.trim(); };
