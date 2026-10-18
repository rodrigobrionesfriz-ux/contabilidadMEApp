// Estados financieros: traslado fiel de renderBalance, renderResultados, totalesDeMayor,
// fmtVar y calcularResultadoEjercicio (reportes.js y cierre.js del sistema actual).
// Saldo de una cuenta = debe − haber. Las de naturaleza acreedora (2 y 4) se presentan con el
// signo invertido; nunca con valor absoluto (un banco sobregirado debe restar).

import { tasaIDPC } from './regimenes';

export type Saldos = Record<string, { nombre: string; saldo: number }>;
export interface FilaSuma { cuenta: string; nombre: string; debe: number | string; haber: number | string }

export function saldosDesde(filas: FilaSuma[]): Saldos {
  const M: Saldos = {};
  for (const f of filas) M[f.cuenta] = { nombre: f.nombre, saldo: Math.round(Number(f.debe) - Number(f.haber)) };
  return M;
}
export const naturalezaAcreedora = (cd: string) => cd.startsWith('2') || cd.startsWith('4');
export const saldoPres = (cd: string, saldo: number) => (naturalezaAcreedora(cd) ? -saldo : saldo);
const sumaPres = (M: Saldos, keys: string[]) => keys.reduce((s, k) => s + saldoPres(k, M[k].saldo), 0);
/** Depreciación acumulada (grupo 12 con 5º dígito 2) y estimación de incobrables (1105): restan por diseño. */
export const esCorrectoraActivo = (cd: string) => (cd.startsWith('12') && cd[4] === '2') || cd.startsWith('1105');

/** Cuentas con saldo contrario a su naturaleza que no son correctoras (casi siempre un dato pendiente). */
export function saldosInvertidos(M: Saldos) {
  return Object.keys(M).filter((cd) => {
    if (cd.length !== 7) return false;
    const v = saldoPres(cd, M[cd].saldo);
    if (v >= -0.5) return false;
    return !(cd.startsWith('1') && esCorrectoraActivo(cd));
  }).sort();
}

export interface LineaEF { cuenta: string; nombre: string; valor: number; correctora: boolean; invertida: boolean }
function grupo(M: Saldos, pref: string[]) {
  let tot = 0;
  const lineas: LineaEF[] = Object.keys(M).filter((cd) => cd.length === 7 && pref.some((p) => cd.startsWith(p)) && Math.abs(M[cd].saldo) >= 0.5).sort()
    .map((cd) => {
      const v = saldoPres(cd, M[cd].saldo); tot += v;
      const correctora = cd.startsWith('1') && esCorrectoraActivo(cd);
      return { cuenta: cd, nombre: M[cd].nombre, valor: v, correctora, invertida: v < 0 && !correctora };
    });
  return { lineas, total: tot };
}

export function balanceGeneral(M: Saldos) {
  const ac = grupo(M, ['11']), anc = grupo(M, ['12']), pc = grupo(M, ['21']), pnc = grupo(M, ['22']), pat = grupo(M, ['23']);
  const tI = sumaPres(M, Object.keys(M).filter((k) => k.startsWith('4')));
  const tC = sumaPres(M, Object.keys(M).filter((k) => k.startsWith('3')));
  const resultado = tI - tC;
  const totalActivos = ac.total + anc.total;
  const totalPasivos = pc.total + pnc.total;
  const totalPatrimonio = pat.total + resultado;
  const totalPasivosPatrimonio = totalPasivos + totalPatrimonio;
  return {
    activoCorriente: ac, activoNoCorriente: anc, pasivoCorriente: pc, pasivoNoCorriente: pnc, patrimonio: pat,
    resultado, totalActivos, totalPasivos, totalPatrimonio, totalPasivosPatrimonio,
    cuadra: Math.abs(totalActivos - totalPasivosPatrimonio) < 2, diferencia: Math.abs(totalActivos - totalPasivosPatrimonio), invertidas: saldosInvertidos(M),
  };
}

export function estadoResultados(M: Saldos, regimen: string, anio: number, tasaGuardada: number | null) {
  const cuentas = (pref: string) => Object.keys(M).filter((k) => k.length === 7 && k.startsWith(pref) && Math.abs(M[k].saldo) >= 0.5).sort();
  const suma = (pref: string) => sumaPres(M, cuentas(pref));
  const detalle = (pref: string) => cuentas(pref).map((k) => ({ cuenta: k, nombre: M[k].nombre, valor: saldoPres(k, M[k].saldo) }));
  const ingExp = suma('41'), costoExp = suma('31');
  const margenBruto = ingExp - costoExp;
  const gastosOp = suma('32'), otrosGastosOp = suma('33');
  const resultadoOp = margenBruto - gastosOp - otrosGastosOp;
  const ingFuera = suma('42'), ingFinanc = suma('43'), gastosNoOp = suma('34'), correccMon = suma('35');
  const resAntesImp = resultadoOp + ingFuera + ingFinanc - gastosNoOp - correccMon;
  const impContab = suma('36');
  const tasa = (regimen === '14D8' ? 0 : (tasaGuardada != null ? +tasaGuardada : tasaIDPC(regimen, anio))) / 100;
  const impEstimado = resAntesImp > 0 ? Math.round(resAntesImp * tasa) : 0;
  const estimado = impContab < 0.5 && resAntesImp > 0;
  const impuesto = impContab >= 0.5 ? impContab : impEstimado;
  const utilidadNeta = resAntesImp - impuesto;
  const pct = (x: number) => (ingExp > 0 ? +(x / ingExp * 100).toFixed(1) : 0);
  return {
    niveles: [
      { k: 'ingExp', nm: 'Ingresos de explotación', valor: ingExp, signo: '', pref: '41', detalle: detalle('41') },
      { k: 'costoExp', nm: 'Costo de explotación', valor: costoExp, signo: '−', pref: '31', detalle: detalle('31') },
      { k: 'margenBruto', nm: 'MARGEN BRUTO', valor: margenBruto, subtotal: true },
      { k: 'gastosOp', nm: 'Gastos de administración y ventas', valor: gastosOp, signo: '−', pref: '32', detalle: detalle('32') },
      { k: 'otrosGastosOp', nm: 'Otros gastos operacionales', valor: otrosGastosOp, signo: '−', pref: '33', detalle: detalle('33') },
      { k: 'resultadoOp', nm: 'RESULTADO OPERACIONAL', valor: resultadoOp, subtotal: true },
      { k: 'ingFuera', nm: 'Ingresos fuera de explotación', valor: ingFuera, signo: '+', pref: '42', detalle: detalle('42') },
      { k: 'ingFinanc', nm: 'Ingresos financieros', valor: ingFinanc, signo: '+', pref: '43', detalle: detalle('43') },
      { k: 'gastosNoOp', nm: 'Gastos no operacionales', valor: gastosNoOp, signo: '−', pref: '34', detalle: detalle('34') },
      { k: 'correccMon', nm: 'Corrección monetaria', valor: correccMon, signo: '−', pref: '35', detalle: detalle('35') },
      { k: 'resAntesImp', nm: 'RESULTADO ANTES DE IMPUESTO', valor: resAntesImp, subtotal: true },
    ] as { k: string; nm: string; valor: number; signo?: string; pref?: string; subtotal?: boolean; detalle?: { cuenta: string; nombre: string; valor: number }[] }[],
    ingExp, costoExp, margenBruto, gastosOp, otrosGastosOp, resultadoOp, ingFuera, ingFinanc, gastosNoOp, correccMon, resAntesImp,
    impuesto, tasa: +(tasa * 100).toFixed(1), estimado, utilidadNeta,
    margenes: { bruto: pct(margenBruto), operacional: pct(resultadoOp), neto: pct(utilidadNeta) },
  };
}

export function totalesDeMayor(M: Saldos) {
  const keys = Object.keys(M);
  return {
    ingresos: sumaPres(M, keys.filter((k) => k.startsWith('4'))),
    costos: keys.filter((k) => k.startsWith('3')).reduce((s, k) => s + M[k].saldo, 0),
    activos: keys.filter((k) => k.startsWith('1')).reduce((s, k) => s + M[k].saldo, 0),
    pasivos: sumaPres(M, keys.filter((k) => k.startsWith('2') && !k.startsWith('23'))),
    capital: sumaPres(M, keys.filter((k) => k.startsWith('23'))),
  };
}

/** Variación porcentual; ≥ 20% se marca como significativa. */
export function fmtVar(actual: number, anterior: number) {
  const dif = actual - anterior;
  if (Math.abs(anterior) < 0.5) {
    if (Math.abs(actual) < 0.5) return { txt: '–', tono: 'neutro' as const, sig: false };
    return { txt: 'nuevo', tono: 'info' as const, sig: true };
  }
  const pct = dif / Math.abs(anterior) * 100;
  return { txt: (pct > 0 ? '+' : '') + pct.toFixed(1) + '%', tono: dif > 0 ? 'positivo' as const : dif < 0 ? 'negativo' as const : 'neutro' as const, sig: Math.abs(pct) >= 20, dif };
}

export function comparativo(MA: Saldos, MB: Saldos, tipo: 'balance' | 'resultados') {
  const a = totalesDeMayor(MA), b = totalesDeMayor(MB);
  const resA = a.ingresos - a.costos, resB = b.ingresos - b.costos;
  const filas: [string, number, number][] = tipo === 'resultados'
    ? [['Ingresos de explotación', a.ingresos, b.ingresos], ['Costos y gastos', a.costos, b.costos], ['Resultado del ejercicio', resA, resB]]
    : [['Total activos', a.activos, b.activos], ['Total pasivos', a.pasivos, b.pasivos], ['Capital', a.capital, b.capital], ['Resultado del ejercicio', resA, resB]];
  return filas.map(([nm, x, y]) => ({ nm, actual: x, anterior: y, ...fmtVar(x, y) }));
}

/** Resultado del ejercicio para el cierre: cuentas 3 y 4 con saldo (igual que calcularResultadoEjercicio). */
export function resultadoEjercicio(M: Saldos) {
  const cuentas = Object.keys(M).filter((k) => k.length === 7 && (k.startsWith('3') || k.startsWith('4')) && Math.abs(M[k].saldo) >= 0.5);
  const ingresos = cuentas.filter((k) => k.startsWith('4')).reduce((s, k) => s + Math.abs(M[k].saldo), 0);
  const gastos = cuentas.filter((k) => k.startsWith('3')).reduce((s, k) => s + Math.abs(M[k].saldo), 0);
  return { cuentas: cuentas.sort(), ingresos, gastos, resultado: ingresos - gastos };
}
