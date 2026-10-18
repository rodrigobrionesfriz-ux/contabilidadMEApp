// Renta anual (F22): traslado fiel de calcularRenta (renta.js del sistema actual).
//
//   Resultado según balance (antes de impuesto)
//   (+) agregados: impuesto contabilizado, gastos rechazados, depreciación financiera, CM deudora
//   (−) deducciones: depreciación tributaria, CM acreedora, manuales
//   (−) pérdida tributaria de arrastre (Art. 31 N°3)
//   = renta líquida imponible (o pérdida tributaria)

import { regimenInfo, tasaIDPC, type Regimen } from '@/estados/regimenes';
import { saldoPres, type Saldos } from '@/estados/eeff';
import { conciliacionDepreciacionAF, type Bien } from '@/activo-fijo/depreciacion';

export interface LineaManual { lbl: string; monto: number }
export interface DatosRenta {
  regimen: string;
  tasa: number | null;
  perdidaArrastre: number;
  rechazadas: string[];
  /** Líneas de asiento marcadas una a una como gasto rechazado (ids de asiento_lineas). */
  lineasRechazadas: number[];
  agregados: LineaManual[];
  deducciones: LineaManual[];
  creditos: { af33bis: number; sence: number; donaciones: number; otros: number };
  basePresunta: number;
  pctPresuncion: number | null;
  ppmManual: number | null;
  reajustePPM: number;
  notas: string;
}
export const rentaPorDefecto = (regimen = '14D3'): DatosRenta => ({
  regimen, tasa: null, perdidaArrastre: 0, rechazadas: [], lineasRechazadas: [], agregados: [], deducciones: [],
  creditos: { af33bis: 0, sence: 0, donaciones: 0, otros: 0 }, basePresunta: 0, pctPresuncion: null, ppmManual: null, reajustePPM: 0, notas: '',
});
/** Mezcla lo guardado con los valores por defecto (igual que cargarRenta). */
export function normalizarRenta(p: unknown, regimen: string): DatosRenta {
  const d = rentaPorDefecto(regimen);
  if (!p || typeof p !== 'object') return d;
  const x = p as Partial<DatosRenta>;
  return { ...d, ...x, creditos: { ...d.creditos, ...(x.creditos || {}) }, rechazadas: Array.isArray(x.rechazadas) ? x.rechazadas : [],
    lineasRechazadas: Array.isArray(x.lineasRechazadas) ? x.lineasRechazadas : [], agregados: Array.isArray(x.agregados) ? x.agregados : [], deducciones: Array.isArray(x.deducciones) ? x.deducciones : [] };
}

const PISTAS_RECHAZO: { re: RegExp; motivo: string }[] = [
  { re: /MULTA|SANCI[ÓO]N|INFRACCI[ÓO]N/i, motivo: 'Multas y sanciones (Art. 31 inc. 2°)' },
  { re: /INTERES(ES)? (FISCAL|PENAL|MORATORIO)/i, motivo: 'Intereses penales fiscales (Art. 31 inc. 2°)' },
  { re: /DONACI[ÓO]N/i, motivo: 'Donaciones: deducibles sólo dentro del límite legal' },
  { re: /GASTO(S)? RECHAZADO|NO DEDUCIBLE/i, motivo: 'Gasto rechazado (Art. 21)' },
  { re: /RETIRO|PARTICULAR(ES)?/i, motivo: 'Retiros y gastos particulares del dueño (Art. 21)' },
  { re: /PROVISI[ÓO]N|ESTIMACI[ÓO]N/i, motivo: 'Provisión o estimación: deducible sólo al materializarse' },
  { re: /MERMA|DESTRUCCI[ÓO]N|P[ÉE]RDIDA(S)? DE (MERCADER|INVENTAR|EXISTENC)/i, motivo: 'Mermas o destrucción de inventario: deducibles si son habituales del proceso con respaldo técnico, o si la destrucción se comunicó al SII o se hizo ante ministro de fe (Circular N° 32 de 2020). Si no, gasto rechazado (Art. 21)' },
];
export function motivoRechazo(nombre: string) {
  const h = PISTAS_RECHAZO.find((p) => p.re.test(String(nombre || '')));
  return h ? h.motivo : '';
}

const cuentasCon = (M: Saldos, pref: string) => Object.keys(M).filter((k) => k.length === 7 && k.startsWith(pref) && Math.abs(M[k].saldo) >= 0.5).sort();
const sumaPref = (M: Saldos, pref: string) => cuentasCon(M, pref).reduce((s, k) => s + saldoPres(k, M[k].saldo), 0);

/** Cuentas de costo y gasto con saldo, con la sugerencia de rechazo. */
export function cuentasGasto(M: Saldos, rechazadas: string[]) {
  return cuentasCon(M, '3').map((cd) => ({ cd, nm: M[cd].nombre, monto: saldoPres(cd, M[cd].saldo), sugerido: motivoRechazo(M[cd].nombre), marcada: rechazadas.includes(cd) }));
}

export interface AjusteRenta { cod: string; lbl: string; monto: number; auto: boolean; nota?: string; cuenta?: string; idx?: number }
export interface EntradaRenta {
  anio: number;
  M: Saldos;
  datos: DatosRenta;
  bienes: Bien[];
  /** PPM del ejercicio según el F29 (suma de los 12 meses). */
  ppmF29: number;
  /** Líneas marcadas como gasto rechazado una a una (debe y haber por línea). */
  movRechazados: { cuenta: string; debe: number; haber: number }[];
}

export function calcularRenta(e: EntradaRenta) {
  const { anio, M, datos: RENTA } = e;
  const reg: Regimen & { presuncion?: { lbl: string; pct: number }; recuadro?: number; cod?: Record<string, string>; linea?: number; codLinea?: number } = regimenInfo(RENTA.regimen);
  const nm = (cd: string) => (M[cd] ? M[cd].nombre : cd);

  const ingExp = sumaPref(M, '41');
  const otrosIng = sumaPref(M, '42') + sumaPref(M, '43');
  const ingresos = sumaPref(M, '4');
  const costoExp = sumaPref(M, '31');
  const gastosOp = sumaPref(M, '32') + sumaPref(M, '33');
  const gastosNoOp = sumaPref(M, '34');
  const correccMon = sumaPref(M, '35');
  const impContab = sumaPref(M, '36');
  const gastos = sumaPref(M, '3') - impContab;
  const resultadoBalance = ingresos - gastos;

  const ag: AjusteRenta[] = [];
  if (Math.abs(impContab) >= 0.5) ag.push({ cod: '', lbl: 'Impuesto a la renta contabilizado en el ejercicio', monto: impContab, auto: true, nota: 'El IDPC no es un gasto deducible (Art. 31 N°2 LIR). Se agrega para llegar a la base tributaria.' });
  RENTA.rechazadas.forEach((cd) => {
    if (!M[cd]) return;
    const monto = saldoPres(cd, M[cd].saldo);
    if (Math.abs(monto) < 0.5) return;
    ag.push({ cod: '', lbl: 'Gasto rechazado: ' + nm(cd), monto, auto: true, cuenta: cd, nota: motivoRechazo(M[cd].nombre) || 'Marcado como no deducible (Art. 21 / Art. 31 LIR).' });
  });
  // Movimientos marcados uno a uno: se agregan por cuenta, salvo que la cuenta entera ya esté marcada.
  const rechazoDoc = new Map<string, { monto: number; n: number }>();
  for (const m of e.movRechazados) {
    if (RENTA.rechazadas.includes(m.cuenta)) continue;
    const monto = (+m.debe || 0) - (+m.haber || 0);
    if (Math.abs(monto) < 0.5) continue;
    const k = m.cuenta || 'sin-cuenta';
    const x = rechazoDoc.get(k) || { monto: 0, n: 0 };
    x.monto += monto; x.n++; rechazoDoc.set(k, x);
  }
  rechazoDoc.forEach((x, cd) => {
    if (Math.abs(x.monto) < 0.5) return;
    ag.push({ cod: '', lbl: `Gasto rechazado documentado: ${nm(cd)} (${x.n} movimiento${x.n === 1 ? '' : 's'})`, monto: x.monto, auto: true, cuenta: cd,
      nota: 'Marcado a nivel de movimiento como gasto rechazado. Se agrega a la RLI sin reclasificar el asiento financiero.' });
  });

  const depConc = conciliacionDepreciacionAF(e.bienes, anio, { deprInstantanea: !!reg.deprInstantanea });
  const depFin = cuentasCon(M, '3301').reduce((s, k) => s + saldoPres(k, M[k].saldo), 0);
  if (Math.abs(depFin) >= 0.5 && Math.abs(depFin - depConc.tributaria) > 0.5)
    ag.push({ cod: '982', lbl: 'Depreciación financiera del ejercicio (reversa tributaria)', monto: depFin, auto: true,
      nota: reg.deprInstantanea ? 'Se reversa la depreciación financiera porque el régimen aplica depreciación tributaria instantánea.' : 'Se reversa la depreciación financiera para sustituirla por la depreciación tributaria determinada según la ficha de activo fijo.' });
  if (!reg.correccionMonetaria && correccMon >= 0.5)
    ag.push({ cod: '1146', lbl: 'Corrección monetaria contabilizada (se reversa)', monto: correccMon, auto: true, nota: 'Pérdida/deudora contabilizada: se agrega para reversarla porque el régimen no aplica corrección monetaria tributaria.' });
  RENTA.agregados.forEach((a, i) => {
    if (Math.abs(+a.monto || 0) < 0.5) return;
    ag.push({ cod: '', lbl: a.lbl || 'Agregado manual', monto: +a.monto || 0, auto: false, idx: i });
  });

  const de: AjusteRenta[] = [];
  if (!reg.correccionMonetaria && correccMon <= -0.5)
    de.push({ cod: '1146', lbl: 'Corrección monetaria acreedora contabilizada (se reversa)', monto: -correccMon, auto: true, nota: 'Ganancia/acreedora contabilizada: se deduce para reversarla porque el régimen no aplica corrección monetaria tributaria.' });
  if (depConc.tributaria >= 0.5 && Math.abs(depFin - depConc.tributaria) > 0.5) {
    const n = depConc.detalle.filter((x) => x.tributaria > 0).length;
    de.push({ cod: '1391', lbl: reg.deprInstantanea ? 'Depreciación tributaria instantánea del activo fijo adquirido en ' + anio : 'Depreciación tributaria del activo fijo ' + anio, monto: depConc.tributaria, auto: true,
      nota: reg.deprInstantanea ? n + ' bien(es) adquiridos en el ejercicio, usando su valor tributario.' : n + ' bien(es) con cuota tributaria en el ejercicio según sus fichas de activo fijo.' });
  }
  RENTA.deducciones.forEach((d, i) => {
    if (Math.abs(+d.monto || 0) < 0.5) return;
    de.push({ cod: '', lbl: d.lbl || 'Deducción manual', monto: +d.monto || 0, auto: false, idx: i });
  });

  const totalAgregados = ag.reduce((s, a) => s + a.monto, 0);
  const totalDeducciones = de.reduce((s, d) => s + d.monto, 0);
  const rliAntesPerdida = resultadoBalance + totalAgregados - totalDeducciones;

  const perdidaPrevia = Math.max(0, +RENTA.perdidaArrastre || 0);
  const perdidaImputada = rliAntesPerdida > 0 ? Math.min(perdidaPrevia, rliAntesPerdida) : 0;
  const perdidaRemanente = perdidaPrevia - perdidaImputada + (rliAntesPerdida < 0 ? -rliAntesPerdida : 0);
  const rli = rliAntesPerdida - perdidaImputada;

  const tasa = RENTA.tasa != null ? +RENTA.tasa : tasaIDPC(RENTA.regimen, anio);
  const presunta = reg.rentaPresunta ? {
    lbl: (reg.presuncion && reg.presuncion.lbl) || 'Base de la presunción',
    valor: Math.max(0, +RENTA.basePresunta || 0),
    pct: RENTA.pctPresuncion != null ? +RENTA.pctPresuncion : ((reg.presuncion && reg.presuncion.pct) || 10),
    renta: 0,
  } : null;
  if (presunta) presunta.renta = Math.round(presunta.valor * presunta.pct / 100);

  const baseImponible = reg.rentaPresunta ? (presunta ? presunta.renta : 0) : Math.max(0, rli);
  const idpc = Math.round(baseImponible * tasa / 100);

  const c = RENTA.creditos || ({} as DatosRenta['creditos']);
  const creditos = [
    { cod: '366', lbl: 'Crédito por inversión en activo fijo (Art. 33 bis)', monto: +c.af33bis || 0 },
    { cod: '82', lbl: 'Crédito por gastos de capacitación (SENCE)', monto: +c.sence || 0 },
    { cod: '895', lbl: 'Crédito por donaciones', monto: +c.donaciones || 0 },
    { cod: '', lbl: 'Otros créditos imputables al IDPC', monto: +c.otros || 0 },
  ].filter((x) => Math.abs(x.monto) >= 0.5);
  const totalCreditos = creditos.reduce((s, x) => s + x.monto, 0);
  const idpcNeto = Math.max(0, idpc - totalCreditos);

  const ppmF29 = e.ppmF29 || 0;
  const ppmBase = RENTA.ppmManual != null ? +RENTA.ppmManual : ppmF29;
  const reaj = +RENTA.reajustePPM || 0;
  const ppmReajustado = Math.round(ppmBase * (1 + reaj / 100));

  const saldo = idpcNeto - ppmReajustado;
  const aPagar = saldo > 0 ? saldo : 0;
  const devolucion = saldo < 0 ? -saldo : 0;

  const activos = sumaPref(M, '1');
  const pasivoExigible = sumaPref(M, '21') + sumaPref(M, '22');
  const cpt = activos - pasivoExigible;

  return {
    anio, reg, tasa,
    ingresos, ingExp, otrosIng, costoExp, gastosOp, gastosNoOp, correccMon, impContab, gastos,
    resultadoBalance, ag, de, totalAgregados, totalDeducciones,
    rliAntesPerdida, perdidaPrevia, perdidaImputada, perdidaRemanente, rli,
    baseImponible, idpc, creditos, totalCreditos, idpcNeto, presunta,
    ppmF29, ppmBase, ppmReajustado, reaj, saldo, aPagar, devolucion,
    depConc, depFin, cpt, activos, pasivoExigible,
  };
}
export type ResultadoRenta = ReturnType<typeof calcularRenta>;

export const fmtPct = (v: number) => String(Math.round((+v || 0) * 100) / 100).replace('.', ',');

/** Filas del Excel del F22 (exportRentaXLSX). */
export function filasExcelRenta(R: ResultadoRenta, empresa: { nombre: string; rut: string }, M: Saldos, datos: DatosRenta) {
  const at = R.anio + 1;
  const rows: (string | number)[][] = [['CÓDIGO', 'CONCEPTO', 'MONTO']];
  const push = (cod: string | undefined, concepto: string, monto: number | '') => rows.push([cod || '', concepto, monto === '' ? '' : Math.round(monto)]);
  const cod = R.reg.cod as Record<string, string>;
  push('', 'DECLARACIÓN DE RENTA · FORMULARIO 22', '');
  push('', 'Empresa: ' + empresa.nombre, '');
  push('', 'RUT: ' + empresa.rut, '');
  push('', 'Ejercicio comercial ' + R.anio + ' · Año Tributario ' + at, '');
  push('', 'Régimen: ' + R.reg.corto + ' ' + R.reg.nm + ' (' + R.reg.art + ') · Tasa IDPC ' + fmtPct(R.tasa) + '%', '');
  push('', '', '');
  push('', 'DETERMINACIÓN DE LA RENTA LÍQUIDA IMPONIBLE', '');
  push(cod.ingresos, 'Ingresos del giro y otros ingresos', R.ingresos);
  push(cod.gastos, 'Costos y gastos del ejercicio', -R.gastos);
  push('645', 'RESULTADO SEGÚN BALANCE (antes de impuesto)', R.resultadoBalance);
  push('', 'AGREGADOS', '');
  R.ag.forEach((a) => push(a.cod, '  ' + a.lbl, a.monto));
  push('', 'Total agregados', R.totalAgregados);
  push('', 'DEDUCCIONES', '');
  R.de.forEach((d) => push(d.cod, '  ' + d.lbl, -d.monto));
  push('', 'Total deducciones', -R.totalDeducciones);
  push('', 'Subtotal antes de pérdidas de arrastre', R.rliAntesPerdida);
  if (R.perdidaPrevia > 0) push('634', 'Pérdida tributaria de arrastre imputada', -R.perdidaImputada);
  push(cod.base, R.rli >= 0 ? 'RENTA LÍQUIDA IMPONIBLE' : 'PÉRDIDA TRIBUTARIA DEL EJERCICIO', R.rli);
  push('', '', '');
  push('', 'FORMULARIO 22 · AT ' + at, '');
  push(cod.base, 'Base Imponible de Primera Categoría', R.baseImponible);
  if (R.reg.k !== '14D8') {
    push(String(R.reg.codLinea), 'Impuesto Primera Categoría (' + fmtPct(R.tasa) + '%)', R.idpc);
    R.creditos.forEach((c) => push(c.cod, '  Crédito: ' + c.lbl, -c.monto));
    push('', 'Total créditos', -R.totalCreditos);
    push('', 'Impuesto Primera Categoría neto', R.idpcNeto);
  }
  push('36', 'PPM del ejercicio (Art. 84 LIR)', -R.ppmBase);
  if (R.reaj) push('', 'Reajuste de PPM (' + fmtPct(R.reaj) + '%)', -(R.ppmReajustado - R.ppmBase));
  push('', 'Total PPM reajustados', -R.ppmReajustado);
  if (R.reg.k !== '14D8') {
    if (R.aPagar > 0) push('91', 'IMPUESTO ADEUDADO · A PAGAR', R.aPagar);
    else push('87', 'REMANENTE · DEVOLUCIÓN SOLICITADA', R.devolucion);
  }
  push('', '', '');
  push('', 'Capital Propio Tributario (referencial)', R.cpt);
  if (R.perdidaRemanente > 0) push('', 'Pérdida de arrastre para el ejercicio siguiente', R.perdidaRemanente);
  if (datos.notas) push('', 'Notas: ' + datos.notas, '');
  const det: (string | number)[][] = [['CÓDIGO', 'CUENTA', 'SALDO', 'MOTIVO']];
  cuentasGasto(M, datos.rechazadas).filter((g) => g.marcada).forEach((g) => det.push([g.cd, g.nm, Math.round(g.monto), g.sugerido || 'Marcado manualmente']));
  return { f22: rows, rechazados: det.length > 1 ? det : null, nombre: 'F22_AT' + at + '_' + (empresa.rut || 'empresa').replace(/[^0-9kK]/g, '') + '.xlsx' };
}
