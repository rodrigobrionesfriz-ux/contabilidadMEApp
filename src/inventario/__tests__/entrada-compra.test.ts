import { describe, it, expect } from 'vitest';
import { cuadraturaCompra, unitarioParaCuadrar, netoLineaCompra, compraDeMovimiento, docTipoCompra } from '../motor';

const factura = { neto: 38840, exento: 0, tipoDTE: 33 };
describe('entrada de inventario desde una compra', () => {
  it('calcula el neto de cada línea con descuento', () => {
    expect(netoLineaCompra({ cantidad: 3, precioUnitario: 1000, descuentoPct: 10 })).toBe(2700);
  });
  it('no cuadra mientras la suma difiera del neto del documento', () => {
    const r = cuadraturaCompra(factura, [{ productoId: 'a', cantidad: 2, precioUnitario: 15000 }, { productoId: 'b', cantidad: 3, precioUnitario: '' }]);
    expect(r).toMatchObject({ neto: 30000, objetivo: 38840, diferencia: 8840, cuadra: false });
  });
  it('el unitario sugerido hace cuadrar exacto, aunque no sea entero', () => {
    const lineas = [{ productoId: 'a', cantidad: 2, precioUnitario: 15000 }, { productoId: 'b', cantidad: 3, precioUnitario: 0 }];
    const u = unitarioParaCuadrar(factura, lineas, 1)!;
    lineas[1].precioUnitario = u;
    expect(cuadraturaCompra(factura, lineas).cuadra).toBe(true);
  });
  it('IVA sólo sobre productos afectos y cero en facturas exentas', () => {
    const l = [{ productoId: 'a', cantidad: 1, precioUnitario: 1000 }, { productoId: 'x', cantidad: 1, precioUnitario: 1000 }];
    expect(cuadraturaCompra({ neto: 2000, exento: 0, tipoDTE: 33 }, l, (p) => p !== 'x').iva).toBe(190);
    expect(cuadraturaCompra({ neto: 0, exento: 2000, tipoDTE: 34 }, l).iva).toBe(0);
    expect(docTipoCompra(34)).toBe('FACTURA EXENTA');
  });
  it('reconoce el documento de origen de una entrada', () => {
    expect(compraDeMovimiento({ lineas: [{ productoId: 'a', cantidad: 1, compraId: 'c1' }] })).toBe('c1');
    expect(compraDeMovimiento({ lineas: [{ productoId: 'a', cantidad: 1 }] })).toBeNull();
  });
});
