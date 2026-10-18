import { describe, it, expect } from 'vitest';
import { calcularSaldos, claveDoc, type LineaAux, type InfoDoc } from '../saldos';

const P = '76151704-K';
let n = 0;
const l = (x: Partial<LineaAux>): LineaAux => ({ cuenta: '2102001', rut: P, tipo_dte: null, folio: null, fecha: '2026-01-01', numero: ++n, glosa: null, debe: 0, haber: 0, ...x });
const info = (e: [string, InfoDoc][]) => new Map(e);

describe('saldos de auxiliares', () => {
  it('pago ligado a su factura, aunque haya facturas más antiguas', () => {
    const r = calcularSaldos('proveedor', [
      l({ tipo_dte: 33, folio: '1', fecha: '2026-01-05', haber: 100 }),
      l({ tipo_dte: 33, folio: '2', fecha: '2026-02-05', haber: 200 }),
      l({ tipo_dte: 33, folio: '2', fecha: '2026-02-20', debe: 200 }),
    ], new Map(), '2026-03-01')[0];
    expect(r.saldo).toBe(100);
    expect(r.items.map((i) => i.folio)).toEqual(['1']);
  });

  it('pago sin documento se imputa FIFO y el sobrante queda a favor', () => {
    const r = calcularSaldos('proveedor', [
      l({ tipo_dte: 33, folio: '1', fecha: '2026-01-05', haber: 100 }),
      l({ tipo_dte: 33, folio: '2', fecha: '2026-02-05', haber: 200 }),
      l({ fecha: '2026-02-28', debe: 150 }),
    ], new Map(), '2026-03-01')[0];
    expect(r.items.map((i) => [i.folio, i.saldo])).toEqual([['2', 150]]);
    const r2 = calcularSaldos('proveedor', [l({ tipo_dte: 33, folio: '1', haber: 100 }), l({ debe: 130 })], new Map(), '2026-03-01')[0];
    expect(r2).toMatchObject({ saldo: -30, aFavor: -30 });
  });

  it('nota de crédito con referencia rebaja su factura; sin referencia va FIFO', () => {
    const docs = info([[claveDoc(P, 61, '9'), { refFolio: '2' }]]);
    const lineas = [
      l({ tipo_dte: 33, folio: '1', fecha: '2026-01-05', haber: 100 }),
      l({ tipo_dte: 33, folio: '2', fecha: '2026-01-10', haber: 200 }),
      l({ tipo_dte: 61, folio: '9', fecha: '2026-01-15', debe: 50 }),
    ];
    expect(calcularSaldos('proveedor', lineas, docs, '2026-03-01')[0].items.map((i) => [i.folio, i.saldo])).toEqual([['1', 100], ['2', 150]]);
    expect(calcularSaldos('proveedor', lineas, new Map(), '2026-03-01')[0].items.map((i) => [i.folio, i.saldo])).toEqual([['1', 50], ['2', 200]]);
  });

  it('clientes usan el signo deudor y el aging usa el vencimiento', () => {
    const docs = info([[claveDoc('77684700-3', 33, '10'), { fecha: '2026-01-01', vence: '2026-01-31', razon: 'Cliente Ltda' }]]);
    const r = calcularSaldos('cliente', [
      l({ cuenta: '1104001', rut: '77684700-3', tipo_dte: 33, folio: '10', fecha: '2026-01-01', debe: 1190 }),
      l({ cuenta: '1104001', rut: '77684700-3', tipo_dte: 33, folio: '11', fecha: '2026-03-01', debe: 500 }),
    ], docs, '2026-03-15')[0];
    expect(r.razon).toBe('Cliente Ltda');
    expect(r.saldo).toBe(1690);
    expect(r.buckets.d60).toBe(1190); // 43 días vencida
    expect(r.buckets.d30).toBe(500); // 14 días desde la fecha (sin vencimiento informado)
  });

  it('saldo de apertura sin documento es un cargo más en la cola FIFO', () => {
    const r = calcularSaldos('proveedor', [
      l({ fecha: '2026-01-01', haber: 300, glosa: 'Balance de apertura' }),
      l({ tipo_dte: 33, folio: '5', fecha: '2026-02-01', haber: 100 }),
      l({ fecha: '2026-02-10', debe: 250 }),
    ], new Map(), '2026-03-01')[0];
    expect(r.items.map((i) => [i.folio, i.saldo])).toEqual([[null, 50], ['5', 100]]);
    expect(r.saldo).toBe(150);
  });
});
