import { describe, it, expect } from 'vitest';
import { flujoRealizado, flujoProyectado, tramoDe, esCuentaEfectivo } from '../flujo';
import { leerCartola, emparejarCartola, resumenConciliacion } from '../conciliacion';

describe('flujo de caja', () => {
  it('realizado: la apertura es el saldo inicial y el saldo se acumula por mes', () => {
    const f = flujoRealizado([
      { fecha: '2026-01-01', debe: 1000, haber: 0, apertura: true },
      { fecha: '2026-01-15', debe: 500, haber: 0, apertura: false },
      { fecha: '2026-03-02', debe: 0, haber: 800, apertura: false },
      { fecha: '2026-03-20', debe: 100, haber: 0, apertura: false },
    ]);
    expect(f.saldoInicial).toBe(1000);
    expect(f.meses[0]).toEqual({ entradas: 500, salidas: 0, neto: 500, saldo: 1500 });
    expect(f.meses[2]).toEqual({ entradas: 100, salidas: 800, neto: -700, saldo: 800 });
    expect([f.entradas, f.salidas, f.saldoFinal]).toEqual([600, 800, 800]);
    expect([esCuentaEfectivo('1101201'), esCuentaEfectivo('1104001'), esCuentaEfectivo('1101')]).toEqual([true, false, false]);
  });
  it('proyectado por tramos de vencimiento', () => {
    expect([tramoDe('2026-10-01', '2026-10-18'), tramoDe('2026-10-18', '2026-10-18'), tramoDe('2026-12-01', '2026-10-18'), tramoDe('2026-12-31', '2026-10-18'), tramoDe('2027-03-01', '2026-10-18')])
      .toEqual(['vencido', 'b30', 'b60', 'b90', 'futuro']);
    const p = flujoProyectado(1000, [{ vence: '2026-10-01', monto: 300, tipo: 'cobrar' }, { vence: '2026-11-01', monto: 500, tipo: 'pagar' }, { vence: '2026-11-02', monto: 0, tipo: 'pagar' }], '2026-10-18');
    expect(p.filas.map((f) => f.posicion)).toEqual([1300, 800, 800, 800, 800]);
    expect(p.posicionFinal).toBe(800);
  });
});

describe('conciliación bancaria', () => {
  const movs = [
    { id: 1, fecha: '2026-03-01', glosa: 'Depósito', debe: 150000, haber: 0 },
    { id: 2, fecha: '2026-03-05', glosa: 'Pago proveedor', debe: 0, haber: 80000 },
    { id: 3, fecha: '2026-03-09', glosa: 'Pago luz', debe: 0, haber: 25000 },
  ];
  it('lee la cartola buscando fecha, monto y descripción', () => {
    const c = leerCartola([['Fecha', 'Detalle', 'Monto'], ['01/03/2026', 'DEPOSITO EFECTIVO', 150000], ['2026-03-05', 'TRANSF A PROVEEDOR', -80000], [], ['05/03/2026', 'COMISION', -3500], ['x', 'sin fecha', 999]]);
    expect(c).toEqual([{ fecha: '01/03/2026', desc: 'DEPOSITO EFECTIVO', monto: 150000 }, { fecha: '2026-03-05', desc: 'TRANSF A PROVEEDOR', monto: -80000 }, { fecha: '05/03/2026', desc: 'COMISION', monto: -3500 }]);
    const e = emparejarCartola(c, movs, new Set());
    expect(e.pares.map((p) => p.mov.id)).toEqual([1, 2]);
    expect(e.sinMatch.map((x) => x.desc)).toEqual(['COMISION']);
  });
  it('acepta CSV leído como texto (montos con puntos) y fechas de Excel', () => {
    const c = leerCartola([['Fecha', 'Detalle', 'Monto'], ['10/01/2027', 'DEPOSITO', '5.000.000'], ['03/02/2027', 'TRANSF ARRIENDO', '-350000'], ['2027-02-28', 'COMISION', '$ -4.500'], [new Date(2027, 2, 5), 'CHEQUE 123', -120000], ['10/03/2027', 'GLOSA', '99']]);
    expect(c).toEqual([{ fecha: '10/01/2027', desc: 'DEPOSITO', monto: 5000000 }, { fecha: '03/02/2027', desc: 'TRANSF ARRIENDO', monto: -350000 }, { fecha: '2027-02-28', desc: 'COMISION', monto: -4500 }, { fecha: '2027-03-05', desc: 'CHEQUE 123', monto: -120000 }]);
  });
  it('resumen: diferencia entre libros y banco', () => {
    const r = resumenConciliacion(movs, new Set([1, 2]), 45000);
    expect(r).toMatchObject({ saldoLibros: 45000, diferencia: 0, pendientes: 1, sumaPendientes: -25000, cuadra: true });
  });
});
