import { describe, it, expect } from 'vitest';
import { montoCL, leerPegado, totales, lineaDiferencia } from '../apertura';

describe('balance de apertura', () => {
  it('lee montos en formato chileno y de Excel', () => {
    expect(montoCL('1.234.567')).toBe(1234567);
    expect(montoCL('$ 1.234')).toBe(1234);
    expect(montoCL('(137.922.578)')).toBe(-137922578);
    expect(montoCL('-500')).toBe(-500);
    expect(montoCL('1234,6')).toBe(1235);
    expect(montoCL('1234.5')).toBe(1235);
    expect(montoCL('')).toBeNull();
    expect(montoCL('Debe')).toBeNull();
  });

  it('lee cuenta, debe y haber con auxiliar, saltando encabezados y nombres', () => {
    const t = [
      'Cuenta\tNombre\tDebe\tHaber',
      '1101201\tBANCO ESTADO\t5.000.000\t',
      '1104001 · FACTURAS POR COBRAR\tFACTURAS\t1.190.000\t\t96.572.800-7\t33\t10',
      '2301001\tCAPITAL SOCIAL\t\t6.190.000',
      '',
      'Total\t\t6.190.000\t6.190.000',
    ].join('\n');
    const r = leerPegado(t);
    expect(r.lineas).toEqual([
      { cuenta: '1101201', debe: 5000000, haber: 0 },
      { cuenta: '1104001', debe: 1190000, haber: 0, rut: '96.572.800-7', dte: '33', folio: '10' },
      { cuenta: '2301001', debe: 0, haber: 6190000 },
    ]);
    expect(r.omitidas).toBe(2);
    expect(totales(r.lineas).cuadra).toBe(true);
  });

  it('acepta cuenta y saldo con signo, separado por punto y coma', () => {
    const r = leerPegado('1101201;1.000\n2102001;-400\n2301001;(600)\n1109001;0');
    expect(r.lineas.map((l) => [l.cuenta, l.debe, l.haber])).toEqual([['1101201', 1000, 0], ['2102001', 0, 400], ['2301001', 0, 600]]);
    expect(r.omitidas).toBe(1);
  });

  it('salda la diferencia contra patrimonio', () => {
    expect(lineaDiferencia([{ debe: 1000, haber: 0 }, { debe: 0, haber: 400 }], '2303001')).toEqual({ cuenta: '2303001', debe: 0, haber: 600, glosa: 'Diferencia de apertura' });
    expect(lineaDiferencia([{ debe: 100, haber: 0 }, { debe: 0, haber: 300 }], '2303001')).toMatchObject({ debe: 200, haber: 0 });
    expect(lineaDiferencia([{ debe: 1, haber: 0 }, { debe: 0, haber: 1 }], '2303001')).toBeNull();
  });
});
