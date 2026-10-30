// Edición de una venta ya registrada (Libro de ventas → ✏️ Editar): datos del documento, forma de cobro y cuenta
// de ingreso. Se rehace el documento contable conservando lo demás (registro SII, origen, glosa, centros) y el
// asiento se recalcula con el mismo motor que al registrar.

import { asientoVenta, type Documento, type LineaDist } from '@/motor/contable';
import type { PlanCuentas } from '@/motor/plan-cuentas';
import { dteV } from '@/motor/dte';
import { rutParse } from '@/motor/rut';
import { lineasDe, redondear, type LineaImport, type MovLegado } from '@/importador/respaldo';
import { esCuentaImpuesto } from './documento';

export type FormaCobro = 'clientes' | 'banco' | 'tarjetas' | 'deudores';
export const FORMAS_COBRO: [FormaCobro, string][] = [
  ['clientes', 'Crédito · por cobrar a clientes (auxiliar)'], ['banco', 'Contado · pagada (banco)'],
  ['tarjetas', 'Tarjetas débito o crédito'], ['deudores', 'Deudores varios'],
];
export const nombreFormaCobro = (f: string | null | undefined) => ({ clientes: 'Crédito (cliente)', banco: 'Contado (banco)', tarjetas: 'Tarjetas', deudores: 'Deudores varios' } as Record<string, string>)[f || 'clientes'] ?? f ?? '';

export interface CambiosVenta {
  fecha: string; fechaVencimiento: string; tipoDTE: number; numero: string; rut: string; razonSocial: string;
  neto: number; exento: number; iva: number; otrosImpuestos: number; formaPago: FormaCobro; cuentaIngreso: string;
}

/** Valores del formulario a partir del documento guardado. */
export function cambiosDesde(datos: Partial<Documento>, fila: { fecha: string; tipo_dte: number; folio: string; rut: string; razon_social: string | null; neto: number; exento: number; iva: number }): CambiosVenta {
  const dist = (datos.dist ?? []).filter((l) => l?.cuenta);
  return {
    fecha: fila.fecha, fechaVencimiento: String(datos.fechaVencimiento ?? ''), tipoDTE: Number(fila.tipo_dte), numero: String(fila.folio ?? ''),
    rut: fila.rut, razonSocial: fila.razon_social ?? '', neto: Number(fila.neto), exento: Number(fila.exento), iva: Number(fila.iva),
    otrosImpuestos: Math.round(Number(datos.otrosImpuestos) || 0), formaPago: ((datos.formaPago as FormaCobro) || 'clientes'),
    cuentaIngreso: String(datos.cuentaIngreso || dist[0]?.cuenta || dteV(fila.tipo_dte)?.cuenta || ''),
  };
}

export const totalVenta = (c: Pick<CambiosVenta, 'neto' | 'exento' | 'iva' | 'otrosImpuestos'>) => Math.round(c.neto) + Math.round(c.exento) + Math.round(c.iva) + Math.round(c.otrosImpuestos);

/** Reparto en varias líneas (centros de costo): si cambia el monto se prorratea; la cuenta se cambia en todas. */
function repartir(dist: LineaDist[], base: number, cuenta: string, cuentaAnterior: string): LineaDist[] {
  const suma = dist.reduce((s, l) => s + Math.round(+l.monto || 0), 0);
  let resto = base;
  return dist.map((l, i) => {
    const m = i === dist.length - 1 ? resto : suma ? Math.round(base * (Math.round(+l.monto || 0) / suma)) : 0;
    resto -= m;
    return { ...l, monto: m, cuenta: cuenta !== cuentaAnterior && l.cuenta === cuentaAnterior ? cuenta : l.cuenta };
  });
}

export type ResultadoEdicion =
  | { ok: true; documento: { tipo_dte: number; folio: string; fecha: string; rut: string; razon_social: string; neto: number; exento: number; iva: number; total: number; datos: Partial<Documento> }; asiento: { fecha: string; glosa: string; lineas: LineaImport[] } }
  | { ok: false; errores: string[] };

export function editarVenta(anterior: Partial<Documento>, c: CambiosVenta, plan: PlanCuentas): ResultadoEdicion {
  const errores: string[] = [];
  const r = rutParse(c.rut);
  if (!r.valido) errores.push(`El RUT ${c.rut} no es válido.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.fecha)) errores.push('Falta la fecha de emisión.');
  if (c.fechaVencimiento && !/^\d{4}-\d{2}-\d{2}$/.test(c.fechaVencimiento)) errores.push('La fecha de vencimiento no es válida.');
  if (c.fechaVencimiento && c.fechaVencimiento < c.fecha) errores.push('El vencimiento no puede ser anterior a la emisión.');
  const dte = dteV(c.tipoDTE);
  if (!dte) errores.push(`El tipo de documento ${c.tipoDTE} no es de ventas.`);
  if (!String(c.numero).trim()) errores.push('Falta el N° del documento.');
  for (const [k, v] of [['neto', c.neto], ['exento', c.exento], ['IVA', c.iva], ['otros impuestos', c.otrosImpuestos]] as const)
    if (!(Number.isFinite(v) && v >= 0)) errores.push(`El ${k} no puede ser negativo.`);
  if (dte && dte.afecto === false && (c.neto || c.iva)) errores.push(`La ${dte.nm} no lleva neto ni IVA: usa exento.`);
  const total = totalVenta(c);
  if (!(total > 0)) errores.push('El total debe ser mayor que cero.');
  if (!['clientes', 'banco', 'tarjetas', 'deudores'].includes(c.formaPago)) errores.push('Forma de cobro no válida.');
  const regla = plan.regla(c.cuentaIngreso);
  if (!regla) errores.push(`La cuenta de ingreso ${c.cuentaIngreso || '(vacía)'} no existe en el plan de cuentas.`);
  else if (!regla.aceptaMovimientos || regla.activa === false) errores.push(`La cuenta de ingreso ${c.cuentaIngreso} no acepta movimientos o está inactiva.`);
  if (errores.length) return { ok: false, errores };

  const base = Math.round(c.neto) + Math.round(c.exento);
  const cuentaAnterior = String(anterior.cuentaIngreso || anterior.dist?.[0]?.cuenta || '');
  const distAnt = (anterior.dist ?? []).filter((l) => l?.cuenta);
  const dist = distAnt.length > 1 ? repartir(distAnt, base, c.cuentaIngreso, cuentaAnterior)
    : distAnt.length === 1 ? [{ ...distAnt[0], cuenta: c.cuentaIngreso, monto: base }] : undefined;
  const vence = c.fechaVencimiento || anterior.fechaVencimiento;
  const datos: Partial<Documento> = {
    ...anterior,
    fecha: c.fecha, tipoDTE: c.tipoDTE, numero: String(c.numero).trim(), rutCodigo: r.codigo, rutDV: r.dv, razonSocial: c.razonSocial.trim(),
    neto: Math.round(c.neto), exento: Math.round(c.exento), iva: Math.round(c.iva), otrosImpuestos: Math.round(c.otrosImpuestos), total,
    formaPago: c.formaPago, cuentaIngreso: c.cuentaIngreso,
    ...(vence ? { fechaVencimiento: vence } : {}),
    ...(vence !== anterior.fechaVencimiento ? { fechaVencimientoOrigen: 'manual' } : {}),
    ...(dist ? { dist } : {}),
  };
  // Al cambiar el monto, el reparto del paso 2 ya no aplica tal cual: queda el nuevo (dist)
  if ((anterior as { detalleRCV?: unknown }).detalleRCV && base !== Math.round(+(anterior.neto ?? 0)) + Math.round(+(anterior.exento ?? 0)))
    delete (datos as { detalleRCV?: unknown }).detalleRCV;
  const e = asientoVenta(datos as Documento, plan);
  if (!e.cuadre.ok) return { ok: false, errores: [`El asiento no cuadra (diferencia ${e.cuadre.diferencia}).`] };
  const { lineas: crudas, descuadre } = redondear(lineasDe(e.movs as MovLegado[]));
  if (descuadre) return { ok: false, errores: [`El asiento no cuadra al redondear (diferencia ${descuadre}).`] };
  const lineas = crudas.map((l) => (!l.glosa?.trim() && esCuentaImpuesto(l.cuenta) ? { ...l, glosa: plan.nombre(l.cuenta) || undefined } : l));
  return {
    ok: true,
    documento: { tipo_dte: c.tipoDTE, folio: String(c.numero).trim(), fecha: c.fecha, rut: `${r.codigo}-${r.dv}`, razon_social: c.razonSocial.trim(),
      neto: Math.round(c.neto), exento: Math.round(c.exento), iva: Math.round(c.iva), total, datos },
    asiento: { fecha: String(e.fecha), glosa: e.glosa, lineas },
  };
}
