import { describe, it, expect } from 'vitest';
import oro from '../__fixtures__/f6-oro.json';
import { balanceGeneral, estadoResultados, totalesDeMayor, fmtVar, resultadoEjercicio, saldosInvertidos, comparativo, type Saldos } from '../eeff';
import { REGIMENES, tasaIDPC } from '../regimenes';

/* eslint-disable @typescript-eslint/no-explicit-any */
const o = oro as any;
const M = (e: any): Saldos => Object.fromEntries(Object.entries(e.saldos).map(([cd, x]: [string, any]) => [cd, { nombre: x.nm, saldo: x.saldo }]));

describe('estados financieros (igual al sistema actual)', () => {
  it('regímenes y tasas', () => {
    expect(REGIMENES).toEqual(o.regimenes);
    expect([tasaIDPC('14D3', 2026), tasaIDPC('14D3', 2028), tasaIDPC('14D3', 2030), tasaIDPC('14A', 2026), tasaIDPC('x', 2026)]).toEqual([12.5, 15, 25, 27, 12.5]);
  });
  for (const [k, e] of Object.entries<any>(o.escenarios)) {
    it(k, () => {
      const reg = k.split(':')[1];
      const r = estadoResultados(M(e), reg, 2026, null);
      const g = e.eerr;
      expect([r.ingExp, r.costoExp, r.margenBruto, r.gastosOp, r.otrosGastosOp, r.resultadoOp, r.ingFuera, r.ingFinanc, r.gastosNoOp, r.correccMon, r.resAntesImp, r.impuesto, r.utilidadNeta])
        .toEqual([g['Ingresos de explotación'], g['Costo de explotación'], g['= MARGEN BRUTO'], g['Gastos de administración y ventas'], g['Otros gastos operacionales'], g['= RESULTADO OPERACIONAL'], g['Ingresos fuera de explotación'], g['Ingresos financieros'], g['Gastos no operacionales'], g['Corrección monetaria'], g['= RESULTADO ANTES DE IMPUESTO'], g['Impuesto a la renta'], g['UTILIDAD NETA DEL EJERCICIO']]);
      expect(r.tasa).toBe(e.tasa);
      expect(r.estimado).toBe(e.estimado);
      const b = balanceGeneral(M(e)), h = e.bal;
      expect([b.activoCorriente.total, b.activoNoCorriente.total, b.totalActivos, b.pasivoCorriente.total, b.pasivoNoCorriente.total, b.totalPasivos, b.resultado, b.totalPatrimonio, b.totalPasivosPatrimonio])
        .toEqual([h['Total Activos Corrientes'], h['Total Activos No Corrientes'], h['TOTAL ACTIVOS'], h['Total Pasivos Corrientes'], h['Total Pasivos No Corrientes'], h['Total Pasivos<'], h['Resultado del Ejercicio'], h['Total Patrimonio'], h['TOTAL PASIVOS + PATRIMONIO']]);
      expect(b.cuadra).toBe(e.cuadra);
      expect(totalesDeMayor(M(e))).toEqual(e.totales);
      const re = resultadoEjercicio(M(e));
      expect(re).toEqual(e.resultado);
    });
  }
  it('cuentas invertidas: banco sobregirado sí, depreciación e incobrables no', () => {
    const inv = saldosInvertidos(M(o.escenarios['normal:14D3']));
    expect(inv).toEqual(['1101201', '1101202']);
    expect(balanceGeneral(M(o.escenarios['normal:14D3'])).activoNoCorriente.lineas.find((l) => l.cuenta === '1201202')).toMatchObject({ correctora: true, invertida: false, valor: -1500000 });
  });
  it('variación porcentual y comparativo', () => {
    for (const [a, b, r] of o.fmtVar) { const v = fmtVar(a, b); expect([v.txt, v.sig]).toEqual([r.txt, r.sig]); }
    const c = comparativo(M(o.escenarios['normal:14D3']), M(o.escenarios['perdida:14D3']), 'resultados');
    expect(c.map((x) => x.nm)).toEqual(['Ingresos de explotación', 'Costos y gastos', 'Resultado del ejercicio']);
  });
});
