// Libro de remuneraciones del mes y asiento de centralización
// (traslado de lineaLibro/totalizar de libroremuneraciones.js y generarAsientoRemuneraciones).

import { SIS_A_SEGURO_SOCIAL_DESDE } from './parametros';
import type { Liquidacion, Trabajador } from './calculo';
import { MESES } from '@/lib/formato';

/* eslint-disable @typescript-eslint/no-explicit-any */
export function lineaLibro(t: Trabajador, l: Liquidacion, periodo: string) {
  const a = l.asis;
  const lre: Record<string, any> = { ...(t.lre || {}) };
  if (a) { lre.diasTrabajados = String(a.diasPagados); lre.diasLicencia = a.diasLicencia ? String(a.diasLicencia) : ''; lre.diasVacaciones = a.diasVacaciones ? String(a.diasVacaciones) : ''; }
  if (l.af) lre.tramoAsignacion = l.af.tramo;
  return {
    id: t.id, nombre: t.nombre, rut: t.rut || '', cargo: t.cargo || '',
    afp: l.afpNm, salud: l.saludNm, afpKey: t.afp || '', saludKey: t.salud || '', contrato: t.contrato || 'indefinido', lre,
    diasPagados: a ? a.diasPagados : 30, diasLicencia: a ? a.diasLicencia : 0, diasPermisoSin: a ? a.diasPermisoSin : 0,
    diasAusencia: a ? a.diasAusencia : 0, horas: l.porHora ? l.horas : null, diasFueraContrato: a ? a.diasFueraContrato : 0,
    baseAFP: l.baseAFP, baseCes: l.baseCes, baseSIS: l.baseSIS, baseAFC: l.baseAFC,
    planUF: l.planUF || 0, descAFP_pension: l.descAFP_pension, descAFP_comision: l.descAFP_comision,
    base: l.base, gratificacion: l.grat,
    gratDetalle: l.gratModo === 'pct' ? `${l.gratInfo ? l.gratInfo.pct : 0}%${l.gratInfo && l.gratInfo.topeAplicado ? ' (topeada)' : ''}` : 'pactada',
    otros: l.otros, totalImponible: l.totalImponible, colacion: l.colacion, movilizacion: l.movilizacion,
    asigFamiliar: l.asigFamiliar || 0, tramoAF: l.af ? l.af.tramo : 'D',
    cargasAF: l.af ? { simples: l.af.cargas.simples, maternales: l.af.cargas.maternales, invalidas: l.af.cargas.invalidas } : { simples: 0, maternales: 0, invalidas: 0 },
    totalNoImponible: l.totalNoImponible, totalHaberes: l.totalHaberes,
    descAFP: l.descAFP, descSalud: l.descSalud, saludLegal: l.saludLegal, adicionalIsapre: l.adicionalIsapre, descCesantia: l.descCesantia,
    descTrabPesado: l.descTrabPesado || 0, trabPesado: l.aporteTrabPesado || 0, califPesado: l.califPesado || '',
    puestoPesado: (t.lre && t.lre.nombrePuestoPesado) || '', tasaTrabPesado: l.tasasTP ? l.tasasTP.trab + l.tasasTP.emp : 0,
    totalPrevisional: l.totalPrevisional, baseTributable: l.baseTributable, iusc: l.iusc,
    iuscTramo: l.iuscDet && l.iuscDet.idx >= 0 ? l.iuscDet.idx + 1 : 0, iuscFactor: l.iuscDet ? l.iuscDet.factor : 0,
    totalDescuentos: l.totalDescuentos, anticipo: l.anticipo || 0, liquido: l.liquido,
    sis: l.patronal.sis, mutual: l.patronal.mutual, afc: l.patronal.afc, caja: l.patronal.caja, totalPatronal: l.patronal.total,
    capInd: l.patronal.capInd || 0, cev: l.patronal.cev || 0, crp: l.patronal.crp || 0,
    ssp: (periodo >= SIS_A_SEGURO_SOCIAL_DESDE ? l.patronal.sis || 0 : 0) + (l.patronal.cev || 0) + (l.patronal.crp || 0),
    tasasReforma: l.patronal.reforma ? { capInd: l.patronal.reforma.capInd, cev: l.patronal.reforma.cev, crp: l.patronal.reforma.crp } : null,
    rentaLicencia: Math.max(0, (l.baseSIS || 0) - (l.baseAFP || 0)),
    jornada: t.tipoPago === 'hora' || String(t.lre && t.lre.jornada) === '201' ? '2' : '1',
    costoEmpresa: l.costoEmpresa,
  };
}
export type LineaLibro = ReturnType<typeof lineaLibro>;

export const CAMPOS_SUMA = ['base', 'gratificacion', 'otros', 'totalImponible', 'colacion', 'movilizacion', 'totalNoImponible', 'totalHaberes',
  'descAFP', 'descSalud', 'saludLegal', 'adicionalIsapre', 'descCesantia', 'totalPrevisional', 'baseTributable', 'iusc', 'anticipo',
  'totalDescuentos', 'liquido', 'sis', 'mutual', 'afc', 'caja', 'capInd', 'cev', 'crp', 'ssp', 'asigFamiliar', 'descTrabPesado', 'trabPesado',
  'totalPatronal', 'costoEmpresa'] as const;
export type Totales = Record<(typeof CAMPOS_SUMA)[number], number> & { n: number };

export function totalizar(lineas: LineaLibro[]): Totales {
  const t = { n: lineas.length } as Totales;
  for (const k of CAMPOS_SUMA) t[k] = lineas.reduce((s, l) => s + (+(l as any)[k] || 0), 0);
  return t;
}

/** Una línea con todo en cero (trabajador fuera de contrato todo el mes) no entra al libro. */
export const lineaVacia = (l: LineaLibro) => !l.totalHaberes && !l.totalDescuentos && !l.totalPatronal;

/** Asiento de centralización del mes (mismas cuentas que el sistema actual). */
export function asientoRemuneraciones(t: Totales, anio: number, mes: number) {
  const totColMov = t.totalNoImponible - t.asigFamiliar;
  const totPrev = t.descAFP + t.descSalud + t.descCesantia + t.descTrabPesado;
  const L: { cuenta: string; debe: number; haber: number; glosa: string }[] = [];
  const add = (cuenta: string, debe: number, haber: number, glosa: string) => { if (debe || haber) L.push({ cuenta, debe: Math.round(debe), haber: Math.round(haber), glosa }); };
  add('3201001', t.totalImponible, 0, `Sueldos ${MESES[mes - 1]}`);
  add('3201003', totColMov, 0, 'Colación y movilización');
  add('2104001', 0, totPrev, 'Instituciones previsionales por pagar');
  add('2104001', t.asigFamiliar, 0, 'Asignación familiar compensada');
  add('2104002', 0, t.iusc, 'Impuesto único por pagar');
  add('1106001', 0, t.anticipo, 'Anticipos descontados en liquidación');
  add('2104005', 0, t.liquido, 'Líquidos por pagar');
  if (t.totalPatronal > 0) {
    add('3201013', t.totalPatronal, 0, `Aporte patronal (SIS, mutual, AFC${t.trabPesado ? ', trabajo pesado' : ''})`);
    add('2104001', 0, t.totalPatronal, 'Aporte patronal por pagar');
  }
  // Un monto negativo (p. ej. líquido negativo) pasa al lado contrario
  const lineas = L.map((l) => (l.debe < 0 || l.haber < 0 ? { ...l, debe: Math.max(0, l.debe) + Math.max(0, -l.haber), haber: Math.max(0, l.haber) + Math.max(0, -l.debe) } : l));
  const tD = lineas.reduce((s, l) => s + l.debe, 0), tH = lineas.reduce((s, l) => s + l.haber, 0);
  return { lineas, cuadra: tD === tH, glosa: `Remuneraciones ${MESES[mes - 1]} ${anio}`, fecha: new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10) };
}
