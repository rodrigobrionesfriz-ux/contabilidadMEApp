import { describe, it, expect } from 'vitest';
import { resumenAnual, variacion, mesConMovimiento, saldosContrarios, gastosPorCuenta, type SumaMes } from '../resumen';

const f = (cuenta: string, tipo: string, debe: number, haber: number, nombre = cuenta): SumaMes => ({ cuenta, nombre, tipo, debe, haber });
const meses: SumaMes[][] = Array.from({ length: 12 }, () => []);
meses[0] = [f('1101101', 'A', 6500000, 0, 'CAJA'), f('2301001', 'P', 0, 6500000)];
meses[1] = [f('1104001', 'A', 1190000, 0), f('4101002', 'I', 0, 1000000), f('2103003', 'P', 0, 190000),
  f('3202024', 'C', 400000, 0, 'GASTOS GENERALES'), f('1101101', 'A', 0, 400000, 'CAJA')];
meses[2] = [f('3101001', 'C', 900000, 0, 'COSTO'), f('1101101', 'A', 0, 7000000, 'CAJA'), f('2102001', 'P', 6100000, 0)];

describe('resumen de la empresa', () => {
  const r = resumenAnual(meses);
  it('ingresos, gastos y resultado acumulado por mes', () => {
    expect(r.ingresos.slice(0, 3)).toEqual([0, 1000000, 0]);
    expect(r.gastos.slice(0, 3)).toEqual([0, 400000, 900000]);
    expect(r.resultadoAcumulado.slice(0, 3)).toEqual([0, 600000, -300000]);
  });
  it('disponible = caja y bancos acumulado', () => {
    expect(r.disponible.slice(0, 3)).toEqual([6500000, 6100000, -900000]);
  });
  it('detecta saldos contrarios y ordena los gastos', () => {
    expect(saldosContrarios(r, 3).map((x) => x.cuenta).sort()).toEqual(['1101101', '2102001']);
    expect(gastosPorCuenta(r, 3).map((x) => x.cuenta)).toEqual(['3101001', '3202024']);
  });
  it('variación y mes con movimiento', () => {
    expect(variacion(150, 100)).toBe(50);
    expect(variacion(5, 0)).toBeNull();
    expect(mesConMovimiento(r, 12)).toBe(3);
  });
});
