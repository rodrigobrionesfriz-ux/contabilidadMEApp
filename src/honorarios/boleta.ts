// Boleta de honorarios recibida: documento + asiento con el motor del sistema actual
// (gasto al debe, retención 2103002 y líquido a Honorarios por pagar 2102006).

import { asientoHonorarioDoc, type Documento } from '@/motor/contable';
import type { PlanCuentas } from '@/motor/plan-cuentas';
import { rutParse } from '@/motor/rut';
import { lineasDe, redondear, retencionHonorarios, type MovLegado } from '@/importador/respaldo';
import type { Registro } from '@/rcv/documento';

export interface DatosBoleta {
  numero: string;
  fecha: string;
  rut: string;
  nombre: string;
  bruto: number;
  conRetencion: boolean;
  /** Tasa (0.1525). Si se omite, la oficial del año de la boleta. */
  tasa?: number;
  cuentaGasto?: string;
  cc?: string;
  glosa?: string;
}

export type ResultadoBoleta =
  | { ok: true; registro: Omit<Registro, 'documento'> & { documento: Omit<Registro['documento'], 'tipo'> & { tipo: 'honorario' } }; retencion: number; liquido: number }
  | { ok: false; errores: string[] };

export function construirBoleta(b: DatosBoleta, plan: PlanCuentas): ResultadoBoleta {
  const errores: string[] = [];
  const rut = rutParse(b.rut);
  if (!rut.valido) errores.push('RUT del prestador no válido.');
  if (!String(b.numero).trim()) errores.push('Falta el N° de boleta.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha)) errores.push('Fecha no válida.');
  if (!(b.bruto > 0)) errores.push('El monto bruto debe ser mayor que cero.');
  const cuenta = b.cuentaGasto || '3202019';
  const r = plan.regla(cuenta);
  if (!r) errores.push(`La cuenta ${cuenta} no existe.`);
  else {
    if (!r.aceptaMovimientos) errores.push(`La cuenta ${cuenta} es agrupadora.`);
    if (r.requiereCentroCosto && !b.cc) errores.push(`La cuenta ${cuenta} exige centro de costo.`);
  }
  if (errores.length) return { ok: false, errores };

  const bruto = Math.round(b.bruto);
  const tasa = b.conRetencion ? (b.tasa ?? retencionHonorarios(+b.fecha.slice(0, 4))) : 0;
  const retencion = Math.round(bruto * tasa);
  const tipoDTE = b.conRetencion ? 70 : 71;
  const id = `honorario:${rut.codigo}:${tipoDTE}:${String(b.numero).trim()}`;
  const doc: Documento = {
    id, tipoDTE, numero: String(b.numero).trim(), fecha: b.fecha, periodoContable: b.fecha.slice(0, 7),
    rutCodigo: rut.codigo, rutDV: rut.dv, razonSocial: b.nombre.trim(),
    bruto, total: bruto, tasaRetencion: tasa, retencion, tipoRetencion: b.conRetencion ? 'con_retencion' : 'sin_retencion',
    cuentaGasto: cuenta, cc: b.cc || '', dist: [{ cuenta, monto: bruto, cc: b.cc || '' }],
    origenRegistro: 'manual', estado: 'activo', ...(b.glosa?.trim() ? { glosa: b.glosa.trim() } : {}),
  };
  const e = asientoHonorarioDoc(doc, plan);
  if (!e.cuadre.ok) return { ok: false, errores: ['El asiento no cuadra.'] };
  const { lineas } = redondear(lineasDe(e.movs as MovLegado[]));
  return {
    ok: true, retencion, liquido: bruto - retencion,
    registro: {
      documento: { tipo: 'honorario', ref: id, tipo_dte: tipoDTE, folio: doc.numero as string, fecha: b.fecha, rut: `${rut.codigo}-${rut.dv}`,
        razon_social: b.nombre.trim(), neto: 0, exento: 0, iva: 0, total: bruto, datos: doc },
      asiento: { fecha: String(e.fecha), glosa: b.glosa?.trim() ? `${e.glosa} · ${b.glosa.trim()}` : e.glosa, lineas },
    },
  };
}
