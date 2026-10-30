import { describe, it, expect } from 'vitest';
import { construirAbonoTarjetas } from '../abono-tarjetas';

const cuadra = (ls: { debe: number; haber: number }[]) => ls.reduce((s, l) => s + l.debe - l.haber, 0);

describe('abono de tarjetas', () => {
  it('comisión contra el proveedor del servicio: banco + proveedor (con RUT) / 1107004 por el bruto', () => {
    const r = construirAbonoTarjetas({ banco: '1101201', depositado: 488100, comision: 11900, trato: 'proveedor', rut: '96.689.310-9', razon: 'Transbank S.A.' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lineas).toEqual([
      { cuenta: '1101201', debe: 488100, haber: 0, glosa: 'Abono ventas con tarjeta' },
      { cuenta: '2102001', debe: 11900, haber: 0, glosa: 'Comisión Transbank S.A.', rut_auxiliar: '96689310-9' },
      { cuenta: '1107004', debe: 0, haber: 500000, glosa: 'Ventas con tarjeta abonadas' },
    ]);
    expect(r.total).toBe(500000);
    expect(cuadra(r.lineas)).toBe(0);
  });
  it('comisión como gasto directo, y sin comisión sólo banco / 1107004', () => {
    const g = construirAbonoTarjetas({ banco: '1101201', depositado: 95000, comision: 5000, trato: 'gasto', cuentaGasto: '3201005' });
    expect(g.ok && g.lineas.map((l) => l.cuenta)).toEqual(['1101201', '3201005', '1107004']);
    const s = construirAbonoTarjetas({ banco: '1101201', depositado: 95000, comision: 0, trato: 'proveedor' });
    expect(s.ok && s.lineas.map((l) => [l.cuenta, l.debe, l.haber])).toEqual([['1101201', 95000, 0], ['1107004', 0, 95000]]);
  });
  it('valida banco, monto, RUT del proveedor y cuenta de gasto', () => {
    expect(construirAbonoTarjetas({ banco: '', depositado: 0, comision: 0, trato: 'proveedor' }).ok).toBe(false);
    expect(construirAbonoTarjetas({ banco: '1101201', depositado: 1000, comision: 100, trato: 'proveedor', rut: '123' }).ok).toBe(false);
    expect(construirAbonoTarjetas({ banco: '1101201', depositado: 1000, comision: 100, trato: 'gasto' }).ok).toBe(false);
  });
});
