// Detalle del pago de imposiciones del mes: traslado fiel de imposiciones.js.
// Cuánto se paga a cada institución y por qué concepto, separando lo descontado al trabajador de
// lo que aporta el empleador, con el mismo reparto del archivo Previred.

import { SIS_A_SEGURO_SOCIAL_DESDE, type Parametros } from '@/remuneraciones/parametros';
import { cajaInfo, mutualInfo } from '@/remuneraciones/calculo';

/* eslint-disable @typescript-eslint/no-explicit-any */
const tasaNum = (v: unknown, d: number) => (v === '' || v == null || !isFinite(+(v as number)) ? d : +(v as number));
const R = (n: unknown) => Math.round(+(n as number) || 0);
const ORDEN: Record<string, number> = { AFP: 1, 'Seguro Social': 2, Salud: 3, CCAF: 4, 'Cesantía': 5, Mutual: 6, ISL: 6 };

export interface ConceptoImp { concepto: string; cargo: string; monto: number; trabajadores: number }
export interface InstitucionImp { institucion: string; tipo: string; conceptos: ConceptoImp[]; total: number }

export function construirImposiciones(libro: { periodo: string; lineas: any[]; cerrado: boolean }, P: Parametros) {
  const L = libro;
  const Pa = P.patronal as Record<string, any>;
  const TASA_FONASA_CON_CCAF = tasaNum(Pa.ccafSaludFonasa, 2.8), TASA_CCAF_FONASA = tasaNum(Pa.ccafSaludCaja, 4.2);
  const conCaja = (Pa.cajaInstitucion || 'ninguna') !== 'ninguna';
  const nomCaja = conCaja ? cajaInfo(Pa.cajaInstitucion, P).nm : '';
  const nomMutual = mutualInfo(Pa.mutualInstitucion, P).nm;
  const esISL = Pa.mutualInstitucion === 'isl';
  const avisos: string[] = [];
  const inst = new Map<string, { institucion: string; tipo: string; conceptos: Map<string, { concepto: string; cargo: string; monto: number; trabajadores: Set<string> }> }>();
  const sumar = (institucion: string, tipo: string, concepto: string, cargo: string, monto0: unknown, idTrab: string) => {
    const monto = R(monto0); if (!monto) return;
    if (!inst.has(institucion)) inst.set(institucion, { institucion, tipo, conceptos: new Map() });
    const c = inst.get(institucion)!.conceptos;
    const k = concepto + '|' + cargo;
    if (!c.has(k)) c.set(k, { concepto, cargo, monto: 0, trabajadores: new Set() });
    const x = c.get(k)!; x.monto += monto; x.trabajadores.add(idTrab);
  };

  const detalle = L.lineas.map((l) => {
    const id = l.id || l.rut || l.nombre;
    let pension = l.descAFP_pension, comision = l.descAFP_comision;
    if (pension === undefined) { pension = R(l.descAFP); comision = 0; if (!avisos.includes('libro')) avisos.push('libro'); }
    sumar(l.afp || 'AFP', 'AFP', 'Cotización obligatoria 10%', 'Trabajador', pension, id);
    sumar(l.afp || 'AFP', 'AFP', 'Comisión AFP', 'Trabajador', comision, id);
    sumar(l.afp || 'AFP', 'AFP', 'Reforma: capitalización individual', 'Empleador', l.capInd, id);
    sumar(l.afp || 'AFP', 'AFP', 'Cotización trabajo pesado', 'Trabajador', l.descTrabPesado, id);
    sumar(l.afp || 'AFP', 'AFP', 'Cotización trabajo pesado', 'Empleador', l.trabPesado, id);
    if (+l.asigFamiliar > 0) sumar(conCaja ? nomCaja : 'IPS (ex INP)', conCaja ? 'CCAF' : 'IPS', 'Asignación familiar pagada (se descuenta)', 'Compensación', -l.asigFamiliar, id);
    const ss = 'Seguro Social Previsional';
    sumar(ss, 'Seguro Social', 'Seguro Social Previsional (expectativa de vida)', 'Empleador', l.cev, id);
    sumar(ss, 'Seguro Social', 'Rentabilidad protegida', 'Empleador', l.crp, id);
    if (L.periodo >= SIS_A_SEGURO_SOCIAL_DESDE) sumar(ss, 'Seguro Social', 'Seguro de invalidez y sobrevivencia (SIS)', 'Empleador', l.sis, id);
    else sumar(l.afp || 'AFP', 'AFP', 'Seguro de invalidez y sobrevivencia (SIS)', 'Empleador', l.sis, id);
    const base = R(l.baseAFP !== undefined ? l.baseAFP : l.totalImponible);
    const fonasa = (l.saludKey || 'fonasa') === 'fonasa';
    const salud7 = R(l.saludLegal); let saludFonasa = 0, saludCaja = 0;
    if (fonasa) {
      if (conCaja) {
        saludFonasa = R(base * TASA_FONASA_CON_CCAF / 100); saludCaja = R(base * TASA_CCAF_FONASA / 100);
        sumar('Fonasa', 'Salud', `Cotización de salud (${TASA_FONASA_CON_CCAF.toLocaleString('es-CL')}%)`, 'Trabajador', saludFonasa, id);
        sumar(nomCaja, 'CCAF', `Cotización de salud Fonasa (${TASA_CCAF_FONASA.toLocaleString('es-CL')}%)`, 'Trabajador', saludCaja, id);
      } else {
        saludFonasa = salud7;
        sumar('Fonasa', 'Salud', 'Cotización de salud 7%', 'Trabajador', salud7, id);
      }
    } else {
      sumar(l.salud || 'Isapre', 'Salud', 'Cotización legal 7%', 'Trabajador', salud7, id);
      sumar(l.salud || 'Isapre', 'Salud', 'Cotización adicional (plan pactado)', 'Trabajador', l.adicionalIsapre, id);
    }
    sumar('AFC Chile', 'Cesantía', 'Seguro de cesantía trabajador', 'Trabajador', l.descCesantia, id);
    sumar('AFC Chile', 'Cesantía', 'Seguro de cesantía empleador', 'Empleador', l.afc, id);
    sumar(nomMutual, esISL ? 'ISL' : 'Mutual', 'Seguro de accidentes del trabajo (Ley 16.744)', 'Empleador', l.mutual, id);
    if (conCaja) sumar(nomCaja, 'CCAF', 'Aporte empleador caja de compensación', 'Empleador', l.caja, id);

    const sisEnAFP = L.periodo < SIS_A_SEGURO_SOCIAL_DESDE;
    const tpTrab = R(l.descTrabPesado), tpEmp = R(l.trabPesado), af = R(l.asigFamiliar);
    const totalAFP = R(pension) + R(comision) + R(l.capInd) + (sisEnAFP ? R(l.sis) : 0) + tpTrab + tpEmp;
    const totalSS = (sisEnAFP ? 0 : R(l.sis)) + R(l.cev) + R(l.crp);
    const totalSalud = fonasa ? saludFonasa + saludCaja : salud7 + R(l.adicionalIsapre);
    const totalAFC = R(l.descCesantia) + R(l.afc);
    const trab = R(pension) + R(comision) + totalSalud + R(l.descCesantia) + tpTrab;
    const emp = R(l.sis) + R(l.capInd) + R(l.cev) + R(l.crp) + R(l.afc) + R(l.mutual) + (conCaja ? R(l.caja) : 0) + tpEmp;
    return {
      rut: l.rut || '', nombre: l.nombre || '', dias: l.diasPagados != null ? l.diasPagados : 30,
      renta: base, rentaAFC: R(l.baseAFC !== undefined ? l.baseAFC : l.baseCes !== undefined ? l.baseCes : base),
      afp: l.afp || '', pension: R(pension), comision: R(comision), capInd: R(l.capInd), sis: R(l.sis), totalAFP,
      cev: R(l.cev), crp: R(l.crp), totalSS,
      salud: fonasa ? (conCaja ? `Fonasa + ${nomCaja}` : 'Fonasa') : l.salud || '', salud7: fonasa ? saludFonasa + saludCaja : salud7, adicional: fonasa ? 0 : R(l.adicionalIsapre), totalSalud,
      afcTrab: R(l.descCesantia), afcEmp: R(l.afc), totalAFC, mutual: R(l.mutual), caja: conCaja ? R(l.caja) : 0,
      tpTrab, tpEmp, asigFam: af, totalTrabajador: trab, totalEmpleador: emp, total: trab + emp - af,
    };
  });

  const instituciones: InstitucionImp[] = [...inst.values()].map((i) => {
    const conceptos = [...i.conceptos.values()].map((c) => ({ ...c, trabajadores: c.trabajadores.size }));
    return { institucion: i.institucion, tipo: i.tipo, conceptos, total: conceptos.reduce((s, c) => s + c.monto, 0) };
  }).sort((a, b) => (ORDEN[a.tipo] || 9) - (ORDEN[b.tipo] || 9) || a.institucion.localeCompare(b.institucion));
  const tot = (k: keyof (typeof detalle)[number]) => detalle.reduce((s, d) => s + (+(d[k] as number) || 0), 0);
  return { libro: L, instituciones, detalle, avisos, totales: { trabajador: tot('totalTrabajador'), empleador: tot('totalEmpleador'), asigFam: tot('asigFam'), total: tot('total') } };
}
export type Imposiciones = ReturnType<typeof construirImposiciones>;

// ── Excel ──
const col = (i: number) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
const suma = (c: number, f1: number, f2: number, valor: number) => ({ t: 'n', v: valor, f: `SUM(${col(c)}${f1}:${col(c)}${f2})`, z: '#,##0' });
const num = (v: unknown) => ({ t: 'n', v: R(v), z: '#,##0' });
type Celda = string | number | { t: string; v: number; f?: string; z: string };

export const HDR_DETALLE = ['RUT', 'TRABAJADOR', 'DÍAS', 'RENTA IMPONIBLE', 'AFP', 'COT. OBLIGATORIA 10%', 'COMISIÓN AFP', 'CAPITALIZACIÓN INDIVIDUAL (EMPL.)', 'SIS (EMPLEADOR)', 'TOTAL AFP', 'SEGURO SOCIAL PREVISIONAL - EXPECTATIVA DE VIDA (EMPL.)', 'RENTABILIDAD PROTEGIDA (EMPL.)', 'TOTAL SEGURO SOCIAL',
  'SALUD', 'COTIZACIÓN 7%', 'ADICIONAL ISAPRE', 'TOTAL SALUD', 'RENTA CESANTÍA', 'CESANTÍA TRABAJADOR', 'CESANTÍA EMPLEADOR', 'TOTAL CESANTÍA',
  'ACCIDENTES (MUTUAL/ISL)', 'APORTE CAJA', 'TRABAJO PESADO TRABAJADOR', 'TRABAJO PESADO EMPLEADOR', 'ASIGNACIÓN FAMILIAR (SE DESCUENTA)', 'TOTAL TRABAJADOR', 'TOTAL EMPLEADOR', 'TOTAL IMPOSICIONES'];
const CLAVES = ['rut', 'nombre', 'dias', 'renta', 'afp', 'pension', 'comision', 'capInd', 'sis', 'totalAFP', 'cev', 'crp', 'totalSS', 'salud', 'salud7', 'adicional', 'totalSalud',
  'rentaAFC', 'afcTrab', 'afcEmp', 'totalAFC', 'mutual', 'caja', 'tpTrab', 'tpEmp', 'asigFam', 'totalTrabajador', 'totalEmpleador', 'total'] as const;
const TEXTO = new Set(['rut', 'nombre', 'afp', 'salud', 'dias']);

/** Hojas del Excel (resumen por institución y detalle por trabajador), con fórmulas de suma. */
export function hojasImposiciones(I: Imposiciones, empresa: { nombre: string; rut: string }, periodoTxt: string) {
  const filas: Celda[][] = [
    ['DETALLE DEL PAGO DE IMPOSICIONES'], [`${empresa.nombre}${empresa.rut ? ' · RUT ' + empresa.rut : ''}`],
    [`Período: ${periodoTxt} · ${I.libro.cerrado ? 'Libro cerrado' : 'Libro provisorio (calculado en vivo)'} · ${I.detalle.length} trabajador(es)`], [],
    ['INSTITUCIÓN', 'TIPO', 'CONCEPTO', 'CARGO DE', 'TRABAJADORES', 'MONTO'],
  ];
  const subtotales: number[] = [];
  I.instituciones.forEach((i) => {
    const ini = filas.length + 1;
    i.conceptos.forEach((c) => filas.push([i.institucion, i.tipo, c.concepto, c.cargo, c.trabajadores, num(c.monto)]));
    const fin = filas.length;
    filas.push(['', '', `Total ${i.institucion}`, '', '', suma(5, ini, fin, i.total)]);
    subtotales.push(filas.length);
    filas.push([]);
  });
  filas.push(['', '', 'TOTAL A PAGAR EN IMPOSICIONES', '', '', { t: 'n', v: I.totales.total, f: subtotales.map((r) => `F${r}`).join('+') || '0', z: '#,##0' }]);
  filas.push(['', '', '  Descontado a los trabajadores', '', '', num(I.totales.trabajador)]);
  filas.push(['', '', '  Aporte del empleador', '', '', num(I.totales.empleador)]);
  if (I.totales.asigFam) filas.push(['', '', '  Menos asignación familiar pagada (compensación)', '', '', num(-I.totales.asigFam)]);
  filas.push([]);
  filas.push(['No incluye el impuesto único de segunda categoría, que se declara y paga en el F29.']);
  if (I.avisos.includes('libro')) filas.push(['Aviso: el libro de este mes se cerró con una versión anterior; la comisión AFP va incluida en la cotización obligatoria. Reábrelo y ciérralo de nuevo para separarla.']);
  const det: Celda[][] = [[`DETALLE POR TRABAJADOR · ${periodoTxt}`], [], HDR_DETALLE, ...I.detalle.map((d) => CLAVES.map((k) => (TEXTO.has(k) ? (d[k] as string | number) : num(d[k]))))];
  const f1 = 4, f2 = det.length;
  det.push(CLAVES.map((k, ci) => (ci === 1 ? 'TOTALES' : TEXTO.has(k) ? '' : suma(ci, f1, f2, I.detalle.reduce((s, d) => s + (+(d[k] as number) || 0), 0)))));
  return { resumen: filas, detalle: det };
}
