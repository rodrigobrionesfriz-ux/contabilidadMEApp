import { describe, it, expect } from 'vitest';
import { construirBoleta } from '../boleta';
import { construirPago } from '@/auxiliares/pago';
import { calcularSaldos, type LineaAux } from '@/auxiliares/saldos';
import { PlanCuentas } from '@/motor/plan-cuentas';
import pdc from '@/motor/__fixtures__/pdc-base.json';

const plan = new PlanCuentas(pdc);
const cuadra = (l: { debe: number; haber: number }[]) => l.reduce((s, x) => s + x.debe - x.haber, 0);

describe('boleta de honorarios', () => {
  it('con retención usa la tasa del año (15,25% en 2026)', () => {
    const r = construirBoleta({ numero: '45', fecha: '2026-03-10', rut: '15.488.555-2', nombre: 'Juan Pérez', bruto: 500000, conRetencion: true }, plan);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.retencion).toBe(76250);
    expect(r.registro.asiento.lineas.map((l) => [l.cuenta, l.debe, l.haber])).toEqual([['3202019', 500000, 0], ['2103002', 0, 76250], ['2102006', 0, 423750]]);
    expect(r.registro.asiento.lineas[2]).toMatchObject({ rut: '15488555-2', folio: '45', tipo_dte: 70 });
    expect(cuadra(r.registro.asiento.lineas)).toBe(0);
  });
  it('sin retención es DTE 71 y todo va a honorarios por pagar', () => {
    const r = construirBoleta({ numero: '7', fecha: '2026-03-10', rut: '15488555-2', nombre: 'Ana', bruto: 300000, conRetencion: false, cuentaGasto: '3202010', cc: 'ADM' }, plan);
    expect(r.ok && r.registro.documento.tipo_dte).toBe(71);
    if (r.ok) expect(r.registro.asiento.lineas.map((l) => [l.cuenta, l.debe, l.haber])).toEqual([['3202010', 300000, 0], ['2102006', 0, 300000]]);
  });
  it('valida RUT y monto', () => {
    expect(construirBoleta({ numero: '1', fecha: '2026-03-10', rut: '1-1', nombre: 'x', bruto: 0, conRetencion: true }, plan).ok).toBe(false);
  });
});

describe('pago', () => {
  it('pago a proveedor salda el documento y no permite pagar de más', () => {
    const fac: LineaAux = { cuenta: '2102001', rut: '76151704-K', tipo_dte: 33, folio: '100', fecha: '2026-03-01', numero: 1, glosa: null, debe: 0, haber: 119000 };
    const [s] = calcularSaldos('proveedor', [fac], new Map(), '2026-03-31');
    const malo = construirPago('proveedor', [{ rut: s.rut, razon: 'Prov', item: s.items[0], monto: 200000 }], '1101201');
    expect(malo.ok).toBe(false);
    const p = construirPago('proveedor', [{ rut: s.rut, razon: 'Prov', item: s.items[0], monto: 119000 }], '1101201');
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(cuadra(p.lineas)).toBe(0);
    const pagoComoLinea: LineaAux = { ...fac, numero: 2, fecha: '2026-03-20', debe: p.lineas[0].debe, haber: 0 };
    expect(calcularSaldos('proveedor', [fac, pagoComoLinea], new Map(), '2026-03-31')[0].saldo).toBe(0);
  });
  it('cobro a cliente abona al haber de clientes y carga el banco', () => {
    const p = construirPago('cliente', [{ rut: '77684700-3', razon: 'Cli', item: { cuenta: '1104001', tipo_dte: 33, folio: '1520', saldo: 1190000 }, monto: 500000 }], '1101201');
    expect(p.ok && p.lineas.map((l) => [l.cuenta, l.debe, l.haber])).toEqual([['1104001', 0, 500000], ['1101201', 500000, 0]]);
  });
});
