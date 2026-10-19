import { describe, it, expect } from 'vitest';
import { advertenciasDocumento, cambiaronMontos } from '../edicion';
import { milesInput } from '@/lib/formato';

const doc = { tipo: 'compra', tipo_dte: 33, folio: '179', rut: '14513781-0', iva: 101133, total: 633413, origen: 'RCV' };
const lineas = [
  { cuenta: '3202026', debe: 532280, haber: 0 },
  { cuenta: '1108002', debe: 101133, haber: 0 },
  { cuenta: '2102001', debe: 0, haber: 633413, rut: '14.513.781-0' },
];

describe('edición de comprobantes', () => {
  it('sin cambios de montos no advierte', () => {
    expect(advertenciasDocumento(doc, lineas)).toEqual([]);
    expect(cambiaronMontos(lineas, lineas)).toBe(false);
  });

  it('cambiar el gasto y el proveedor avisa total y auxiliar; cambiar el IVA avisa el IVA', () => {
    const otro = [{ ...lineas[0], debe: 532281 }, lineas[1], { ...lineas[2], haber: 633414 }];
    const a = advertenciasDocumento(doc, otro);
    expect(a).toHaveLength(2);
    expect(a[0]).toMatch(/total del asiento \(\$633\.414\)/);
    expect(a[1]).toMatch(/saldo del proveedor/);
    expect(cambiaronMontos(lineas, otro)).toBe(true);
    const iva = [{ ...lineas[0], debe: 532279 }, { ...lineas[1], debe: 101134 }, lineas[2]];
    expect(advertenciasDocumento(doc, iva)).toEqual([expect.stringMatching(/IVA del asiento \(\$101\.134\)/)]);
  });

  it('en ventas mira 2103003 y el cliente al debe', () => {
    const v = { tipo: 'venta', rut: '96547890-6', iva: 190, total: 1190 };
    expect(advertenciasDocumento(v, [{ cuenta: '1104001', debe: 1190, haber: 0, rut: '96547890-6' }, { cuenta: '4101001', debe: 0, haber: 1000 }, { cuenta: '2103003', debe: 0, haber: 190 }])).toEqual([]);
  });

  it('formatea montos con miles mientras se digitan (hasta 13 caracteres)', () => {
    expect(milesInput('9999999999')).toBe('9.999.999.999');
    expect(milesInput('633413abc')).toBe('633.413');
    expect(milesInput('')).toBe('');
    expect(milesInput('007')).toBe('7');
    expect(milesInput('99999999999999', 10)).toBe('9.999.999.999');
  });
});
