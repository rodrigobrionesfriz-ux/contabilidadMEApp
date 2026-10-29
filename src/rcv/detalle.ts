// Paso 2 del importador RCV: líneas por documento y su validador.
// Traslado fiel de rcv-detalle.js (validarDetalleRCV, lineasIniciales).

import { dteC, dteV, IVA } from '@/motor/dte';
import type { PlanCuentas } from '@/motor/plan-cuentas';
import type { TipoRCV } from './leer';

export interface LineaDetalle {
  cuenta: string;
  desc?: string;
  monto: number;
  cc?: string;
  afecto?: boolean;
  otroImp?: boolean;
  codImp?: string;
}

export interface DocParaDetalle {
  tipoDTE: number | string;
  neto?: number;
  exento?: number;
  iva?: number;
  otrosImpuestos?: number;
  total?: number;
  ivaRetenido?: number;
  cuenta?: string;
  cc?: string;
  otrosImpuestosDetalle?: { tipo?: string; monto?: number }[];
}

export interface ResultadoValidacion {
  ok: boolean;
  errores: string[];
  avisos: string[];
  resumen: Record<string, number | boolean>;
}

const n = (v: unknown) => Math.round(+(v as number) || 0);
export const tipoLinea = (l: LineaDetalle) => (l?.otroImp ? 'otro' : l?.afecto === false ? 'exento' : 'afecto');
const fmtC = (v: number) => '$ ' + new Intl.NumberFormat('es-CL').format(Math.round(+v || 0));

export function validarDetalleRCV(
  tipo: TipoRCV, doc: DocParaDetalle, lineas: LineaDetalle[], plan: PlanCuentas,
  { aceptaRedondeo = false, legacyOtros = false } = {},
): ResultadoValidacion {
  const errores: string[] = [];
  const avisos: string[] = [];
  const dte = tipo === 'compra' ? dteC(doc.tipoDTE) : dteV(doc.tipoDTE);
  const neto = n(doc.neto), exento = n(doc.exento), iva = n(doc.iva), otros = n(doc.otrosImpuestos), total = n(doc.total);
  const ls = (lineas || []).map((l) => ({ ...l, monto: n(l.monto) }));
  if (!ls.length) errores.push('Agrega al menos una línea.');
  const nBase = ls.filter((l) => tipoLinea(l) !== 'otro').length;
  ls.forEach((l, i) => {
    const k = `Línea ${i + 1}`;
    if (!l.cuenta) errores.push(`${k}: falta la cuenta.`);
    else {
      const r = plan.regla(l.cuenta);
      if (!r) errores.push(`${k}: la cuenta ${l.cuenta} no existe en el plan de cuentas.`);
      else {
        if (!r.aceptaMovimientos) errores.push(`${k}: la cuenta ${l.cuenta} es agrupadora y no acepta movimientos.`);
        if (r.activa === false) errores.push(`${k}: la cuenta ${l.cuenta} está inactiva.`);
        if (r.requiereCentroCosto && !l.cc) errores.push(`${k}: la cuenta ${l.cuenta} exige centro de costo.`);
        if (l.cc && !r.aceptaCentroCosto) avisos.push(`${k}: la cuenta ${l.cuenta} no admite centro de costo; se ignorará.`);
      }
    }
    if (!(l.monto > 0)) errores.push(`${k}: el monto debe ser mayor que cero.`);
    if ((tipoLinea(l) === 'otro' ? ls.length > 1 : nBase > 1) && !String(l.desc || '').trim())
      errores.push(`${k}: la descripción es obligatoria cuando el documento tiene más de una línea.`);
  });
  const sum = (t: string) => ls.filter((l) => tipoLinea(l) === t).reduce((s, l) => s + l.monto, 0);
  const sumAfecto = sum('afecto'), sumExento = sum('exento'), sumOtros = sum('otro');
  const cruzaOtros = tipo === 'compra' && !legacyOtros;
  if (tipo !== 'compra' && sumOtros > 0) errores.push('Las líneas de otros impuestos sólo aplican a compras.');
  const ivaCalc = Math.round(sumAfecto * IVA);
  const difNeto = sumAfecto - neto, difExento = sumExento - exento, difIva = ivaCalc - iva;
  if (difNeto) errores.push(`Las líneas afectas suman ${fmtC(sumAfecto)} y el neto del RCV es ${fmtC(neto)} (diferencia ${fmtC(difNeto)}).`);
  if (difExento) errores.push(`Las líneas exentas suman ${fmtC(sumExento)} y el exento del RCV es ${fmtC(exento)} (diferencia ${fmtC(difExento)}).`);
  if (dte && dte.afecto === false && sumAfecto > 0) errores.push(`El ${dte.nm || 'documento'} no lleva IVA: todas las líneas deben ser exentas.`);
  const redondeoOk = (v: number) => aceptaRedondeo && Math.abs(v) <= 1;
  const otrosLineas = cruzaOtros ? sumOtros : otros;
  const difOtros = cruzaOtros ? sumOtros - otros : 0;
  if (difOtros && !redondeoOk(difOtros)) {
    if (otros > 0 && !sumOtros) errores.push(`El RCV informa otros impuestos por ${fmtC(otros)}: agrega una línea de tipo "Otro impuesto" con su cuenta (costo/gasto, o 1108006 si es recuperable).`);
    else errores.push(`Las líneas de otros impuestos suman ${fmtC(sumOtros)} y el RCV informa ${fmtC(otros)} (diferencia ${fmtC(difOtros)}).`);
  }
  // Manda el RCV del SII: el asiento lleva el IVA y el total informados (el motor ajusta el redondeo en la última
  // línea de costo). Por eso el IVA calculado distinto y un total del RCV que no suma no impiden contabilizar: sólo avisan.
  if (difIva && !difNeto) avisos.push(`IVA calculado ${fmtC(ivaCalc)} (19% de ${fmtC(sumAfecto)}) distinto del IVA del RCV ${fmtC(iva)} (diferencia ${fmtC(difIva)}): se contabiliza el IVA del RCV.`);
  const base = sumAfecto + sumExento;
  let totalCalc = base + iva + otrosLineas;
  let difTotal = totalCalc - total;
  const facturaCompra = tipo === 'compra' && (+doc.tipoDTE === 45 || +doc.tipoDTE === 46 || doc.ivaRetenido != null);
  if (facturaCompra) {
    const sinRet = base + otrosLineas;
    if (Math.abs(sinRet - total) < Math.abs(difTotal)) { totalCalc = sinRet; difTotal = sinRet - total; }
  }
  // Con las líneas cuadradas contra el RCV, una diferencia de total es del propio RCV: se respeta su total.
  // (Facturas de compra con retención: el motor sólo absorbe $1, así que ahí la diferencia sigue bloqueando.)
  const lineasCuadran = !difNeto && !difExento && !(difOtros && !redondeoOk(difOtros));
  if (difTotal && !redondeoOk(difTotal) && facturaCompra)
    errores.push(`Líneas + IVA + otros impuestos = ${fmtC(totalCalc)} y el total del RCV es ${fmtC(total)} (diferencia ${fmtC(difTotal)}).`);
  else if (difTotal && !redondeoOk(difTotal) && lineasCuadran)
    avisos.push(`Neto + exento + IVA + otros impuestos del RCV = ${fmtC(totalCalc)} y su total es ${fmtC(total)} (diferencia ${fmtC(difTotal)}): se contabiliza el total del RCV.`);
  return {
    ok: errores.length === 0, errores, avisos,
    resumen: { sumAfecto, sumExento, sumOtros, difOtros, cruzaOtros, ivaCalc, totalCalc, difNeto, difExento, difIva, difTotal, neto, exento, iva, otros, total },
  };
}

/** Líneas por defecto de un documento (sin historial previo). */
export function lineasIniciales(tipo: TipoRCV, d: DocParaDetalle): LineaDetalle[] {
  const cuenta = tipo === 'venta' ? d.cuenta || dteV(d.tipoDTE)?.cuenta || '' : d.cuenta || '';
  const cc = d.cc || '';
  const out: LineaDetalle[] = [];
  if (n(d.neto) > 0) out.push({ cuenta, desc: '', monto: n(d.neto), cc, afecto: true });
  if (n(d.exento) > 0) out.push({ cuenta, desc: '', monto: n(d.exento), cc, afecto: false });
  if (!out.length) out.push({ cuenta, desc: '', monto: 0, cc, afecto: true });
  if (tipo === 'compra' && n(d.otrosImpuestos) > 0 && !out.some((l) => l.otroImp)) {
    const c0 = out[0]?.cuenta || d.cuenta || '', cc0 = out[0]?.cc || d.cc || '';
    const det = (d.otrosImpuestosDetalle || []).filter((x) => x && n(x.monto) > 0);
    const sumDet = det.reduce((s, x) => s + n(x.monto), 0);
    if (det.length && sumDet === n(d.otrosImpuestos)) {
      det.forEach((x) => {
        const cod = String(x.tipo || '');
        const numCod = /^\d+$/.test(cod);
        out.push({ cuenta: c0, cc: cc0, monto: n(x.monto), afecto: false, otroImp: true, codImp: numCod ? cod : '', desc: numCod ? `Otro impuesto cód. ${cod}` : 'Otros impuestos' });
      });
    } else out.push({ cuenta: c0, cc: cc0, monto: n(d.otrosImpuestos), afecto: false, otroImp: true, codImp: '', desc: 'Otros impuestos' });
  }
  return out;
}

/** Completa la línea i con lo que falta para cuadrar su tipo (botón ⇥). */
export function completarLinea(tipo: TipoRCV, d: DocParaDetalle, lineas: LineaDetalle[], i: number): number {
  const t = tipoLinea(lineas[i]);
  const objetivo = t === 'afecto' ? n(d.neto) : t === 'exento' ? n(d.exento) : n(d.otrosImpuestos);
  const otras = lineas.reduce((s, l, j) => (j !== i && tipoLinea(l) === t ? s + n(l.monto) : s), 0);
  return Math.max(0, objetivo - otras);
}
