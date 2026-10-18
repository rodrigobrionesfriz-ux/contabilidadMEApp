import { describe, it, expect } from 'vitest';
import oro from '../__fixtures__/inv-oro.json';
import * as M from '../motor';
import { prepararImportacionProductos, siguienteCodigo } from '../importador';

const J = (x: unknown) => JSON.parse(JSON.stringify(x));
const productos = oro.productos as M.Producto[];
const movs = oro.movs as unknown as M.Movimiento[];

describe('inventario (casos de oro del sistema actual)', () => {
  it('reconstruye stock, lotes, PPP, valorizaciones y errores', () => {
    const c = M.recalcularInventario(movs, productos);
    expect(J({ stock: c.stock, lotes: c.lotes, errores: c.errores, valorizaciones: [...c.valorizaciones.entries()] })).toEqual(oro.calc);
  });
  it('valida movimientos igual', () => {
    oro.casosVal.forEach((m, i) => expect(J(M.validarMovimiento(m as unknown as M.Movimiento, { productos, bodegas: oro.bodegas, movimientos: movs }))).toEqual(oro.val[i]));
  });
  it('rebasa líneas de toma con movimientos posteriores', () => {
    const c = M.recalcularInventario(movs, productos);
    const lineas = [{ id: 'x', productoId: 'p1', lote: '', fisico: 80, fisicoFecha: '2026-01-12T00:00:00Z' }, { id: 'y', productoId: 'p2', lote: 'l2', fisico: 4, fisicoFecha: null }, { id: 'z', productoId: 'p1', lote: '', fisico: null, fisicoFecha: '2026-01-30T00:00:00Z' }];
    expect(lineas.map((l) => M.rebasarLineaToma(l as unknown as M.LineaToma, oro.toma as unknown as M.Toma, movs, c))).toEqual(oro.reb);
    expect(M.movimientosNetosDespues(movs, { desde: '2026-01-01', productoId: 'p1', bodegaId: 'b2' })).toBe(oro.neto);
  });
  it('órdenes de compra y recepciones', () => {
    const oc = oro.oc as unknown as M.OrdenCompra, recs = oro.recs as unknown as M.Recepcion[];
    expect(M.calcularTotalesOC(oc)).toEqual(oro.ocOut.totales);
    expect(J(M.resumenRecepcionOC(oc, recs))).toEqual(oro.ocOut.resumen);
    expect(M.estadoSegunRecepciones(oc, recs)).toBe(oro.ocOut.estado);
    expect(M.estadoSegunRecepciones(oc, [])).toBe(oro.ocOut.estadoVacio);
    expect(M.estadoSegunRecepciones(oc, [...recs, { ordenCompraId: 'oc1', fecha: '', documentoNumero: '', lineas: [{ ocLineaId: 'a', cantidad: 4.5 }] }])).toBe(oro.ocOut.estadoCompleto);
    const malo = { ...oc, fechaEntrega: '2026-02-01', proveedorNombre: '', bodegaId: 'b3', lineas: [{ productoId: 'p1', cantidad: 1, precioUnitario: 0, descuentoPct: 100 }, { productoId: 'p1', cantidad: 1, precioUnitario: 1, descuentoPct: 0 }, { productoId: 'p3', cantidad: 1, precioUnitario: 1 }, { productoId: 'zz', cantidad: 2 }] } as unknown as M.OrdenCompra;
    expect(J(M.validarOrdenCompra(malo, { productos, bodegas: oro.bodegas, proveedores: [{ rut: '1-9' }] }))).toEqual(oro.ocOut.valOC[0]);
    expect(J(M.validarOrdenCompra(oc, { productos, bodegas: oro.bodegas }))).toEqual(oro.ocOut.valOC[1]);
    const r1 = { fecha: '2026-02-01', documentoNumero: '', lineas: [{ ocLineaId: 'a', cantidad: 5 }, { ocLineaId: 'b', cantidad: 1 }, { ocLineaId: 'q', cantidad: 1 }] } as unknown as M.Recepcion;
    expect(J(M.validarRecepcion(r1, oc, { productos, recepciones: recs }))).toEqual(oro.ocOut.valRec[0]);
    expect(J(M.validarRecepcion({ fecha: '2026-03-05', documentoNumero: '55', lineas: [{ ocLineaId: 'a', cantidad: 2 }] } as unknown as M.Recepcion, oc, { productos, recepciones: recs }))).toEqual(oro.ocOut.valRec[1]);
    expect(J(M.validarRecepcion({ fecha: '', documentoNumero: '1', lineas: [] } as unknown as M.Recepcion, null))).toEqual(oro.ocOut.valRec[2]);
  });
  it('importa la plantilla de productos', () => {
    [false, true].forEach((actualizar, i) => expect(J(prepararImportacionProductos(oro.filas, { productos: [{ id: 'p1', codigo: 'P000001', ean: '', tipo: 'MERCADERÍA', unidad: 'UN', cuentaCosto: '3101001' }, { id: 'p2', codigo: 'P000002', ean: '781', manejaLotes: true, cuentaCosto: '3101002' }], actualizar, cuentaGastoExiste: (c) => c.startsWith('3'), productosConMovimientos: ['p2'] }))).toEqual(oro.imp[i]));
    expect(() => prepararImportacionProductos([['A', 'B']])).toThrow(/CÓDIGO y DESCRIPCIÓN/);
    expect(siguienteCodigo(['P000009', 'X1', 'p000010'])).toBe('P000011');
  });
  it('concilia recepción con factura', () => {
    const compras: M.DocCompra[] = oro.compras.map((c) => ({ id: c.id, tipoDTE: c.tipoDTE, rut: c.rutCodigo, folio: c.numero, fecha: c.fecha, total: c.total ?? 0, estado: c.estado }));
    const rec = oro.rec;
    expect(M.buscarCompraParaRecepcion(rec, compras)?.id ?? undefined).toBe(oro.conc.buscar);
    expect(M.buscarCompraParaRecepcion({ ...rec, tipoDTE: 52 }, compras)).toBe(oro.conc.buscarGuia);
    expect(M.comprasVinculables(rec, compras).map((c) => c.id)).toEqual(oro.conc.vinculables);
    expect(M.otrasRecepcionesMismoDocumento(rec, [rec, { id: 'r2', proveedorRut: '76111111-1', documentoNumero: '455', estado: 'VIGENTE' }, { id: 'r3', proveedorRut: '76111111-1', documentoNumero: '455', estado: 'ANULADA' }]).map((r) => r.id)).toEqual(oro.conc.otras);
  });
  it('folios correlativos ignoran los antiguos', () => {
    expect(M.nuevoFolio('ENTRADA', ['ENT-000004', 'ENT-260915103012-X7K', 'SAL-000009'])).toBe('ENT-000005');
    expect(M.nuevoFolio('OC', [], ['OC-000001'])).toBe('OC-000002');
  });
});
