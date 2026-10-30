import { describe, it, expect } from 'vitest';
import { editarVenta, cambiosDesde } from '../editar-venta';
import { PlanCuentas } from '@/motor/plan-cuentas';
import pdc from '@/motor/__fixtures__/pdc-base.json';
import type { Documento } from '@/motor/contable';

const plan = new PlanCuentas(pdc);
const fila = { fecha: '2026-02-05', tipo_dte: 33, folio: '7', rut: '77987955-0', razon_social: 'CHARCUTERIA GARCIA SPA', neto: 602042, exento: 0, iva: 114388 };
const datos: Partial<Documento> = { tipoDTE: 33, numero: '7', fecha: '2026-02-05', rutCodigo: '77987955', rutDV: '0', razonSocial: 'CHARCUTERIA GARCIA SPA',
  neto: 602042, exento: 0, iva: 114388, total: 716430, formaPago: 'clientes', cuentaIngreso: '4101002', origenRegistro: 'RCV', registroSII: [{ a: '1' }] } as Partial<Documento>;
const cuadra = (ls: { debe: number; haber: number }[]) => ls.reduce((s, l) => s + l.debe - l.haber, 0);

describe('editar una venta registrada', () => {
  it('cambia la forma de cobro a banco: el cargo pasa de clientes a 1101201 y se conserva el registro SII', () => {
    const c = { ...cambiosDesde(datos, fila), formaPago: 'banco' as const };
    const r = editarVenta(datos, c, plan);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.asiento.lineas.find((l) => l.debe > 0)?.cuenta).toBe('1101201');
    expect(r.asiento.lineas.some((l) => l.cuenta === '1104001')).toBe(false);
    expect(r.documento.datos.registroSII).toEqual([{ a: '1' }]);
    expect(cuadra(r.asiento.lineas)).toBe(0);
  });
  it('a crédito, la línea de clientes lleva RUT, tipo y folio', () => {
    const r = editarVenta(datos, cambiosDesde(datos, fila), plan);
    expect(r.ok && r.asiento.lineas.find((l) => l.cuenta === '1104001')).toMatchObject({ debe: 716430, rut: '77987955-0', folio: '7' });
  });
  it('corrige montos y folio; el total se recalcula', () => {
    const r = editarVenta(datos, { ...cambiosDesde(datos, fila), neto: 320000, iva: 60800, numero: '8' }, plan);
    expect(r.ok && r.documento).toMatchObject({ total: 380800, folio: '8' });
    expect(r.ok && cuadra(r.asiento.lineas)).toBe(0);
  });
  it('prorratea un reparto en varios centros y cambia la cuenta de ingreso', () => {
    const d2 = { ...datos, dist: [{ cuenta: '4101002', monto: 400000, cc: 'A' }, { cuenta: '4101002', monto: 202042, cc: 'B' }] } as Partial<Documento>;
    const r = editarVenta(d2, { ...cambiosDesde(d2, fila), neto: 300000, iva: 57000, cuentaIngreso: '4101003' }, plan);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.documento.datos.dist?.map((l) => [l.cuenta, l.monto])).toEqual([['4101003', 199322], ['4101003', 100678]]);
    expect(cuadra(r.asiento.lineas)).toBe(0);
  });
  it('rechaza RUT inválido, tipo que no es de ventas y cuenta inexistente', () => {
    const r = editarVenta(datos, { ...cambiosDesde(datos, fila), rut: '77987955-1', tipoDTE: 46, cuentaIngreso: '9999999' }, plan);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errores.join(' ')).toMatch(/RUT.*no es válido.*no es de ventas.*no existe/);
  });
});

describe('editar un resumen de boletas o vouchers', () => {
  const filaR = { fecha: '2026-10-02', tipo_dte: 48, folio: 'R20261002', rut: '66666666-6', razon_social: 'Ventas con comprobante de pago electrónico', neto: 42017, exento: 0, iva: 7983 };
  const datosR = { tipoDTE: 48, numero: 'R20261002', fecha: '2026-10-02', rutCodigo: '66666666', rutDV: '6', razonSocial: filaR.razon_social,
    neto: 42017, exento: 0, iva: 7983, total: 50000, formaPago: 'tarjetas', cuentaIngreso: '4101002', cantidad: 12, origenRegistro: 'manual' } as Partial<Documento>;
  it('carga y cambia la cantidad de documentos; el asiento sigue cuadrando', () => {
    const c = cambiosDesde(datosR, filaR);
    expect(c.cantidad).toBe(12);
    const r = editarVenta(datosR, { ...c, cantidad: 15, neto: 50420, iva: 9580 }, plan);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.documento.datos.cantidad).toBe(15);
    expect(r.documento.total).toBe(60000);
    expect(r.asiento.lineas.find((l) => l.debe > 0)?.cuenta).toBe('1107004');
    expect(cuadra(r.asiento.lineas)).toBe(0);
  });
  it('exige la cantidad en un resumen y la quita si pasa a factura', () => {
    const c = cambiosDesde(datosR, filaR);
    expect(editarVenta(datosR, { ...c, cantidad: 0 }, plan).ok).toBe(false);
    const r = editarVenta(datosR, { ...c, tipoDTE: 33, numero: '99', rut: '77987955-0' }, plan);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.documento.datos.cantidad).toBeUndefined();
  });
});
