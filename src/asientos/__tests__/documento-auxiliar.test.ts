import { describe, it, expect } from 'vitest';
import { docVacio, totalesDoc, validarDocAux, ladoLinea, docRCVDesde, dtesDe } from '../documento-auxiliar';

describe('documento de una línea de auxiliar', () => {
  it('factura de proveedor: IVA 19% y total', () => {
    const d = { ...docVacio('proveedor', '2026-10-21'), rut: '77090370-K', razon: 'Biosur', folio: '518778', neto: 74329 };
    expect(totalesDoc('proveedor', d)).toMatchObject({ iva: 14123, total: 88452, montoLinea: 88452 });
    expect(validarDocAux('proveedor', d)).toEqual([]);
    expect(ladoLinea('proveedor', 33)).toBe('haber');
    expect(ladoLinea('proveedor', 61)).toBe('debe');
    expect(docRCVDesde('proveedor', d)).toMatchObject({ rutCodigo: '77090370', rutDV: 'K', numero: '518778', total: 88452, fechaVencimiento: '2026-11-20' });
  });
  it('factura de compra (46): el IVA se retiene y no suma al total', () => {
    const d = { ...docVacio('proveedor', '2026-10-21'), tipoDTE: 46, neto: 100000 };
    expect(totalesDoc('proveedor', d)).toMatchObject({ iva: 19000, total: 100000, ivaRetenido: 19000 });
  });
  it('boleta de honorarios con retención: la línea lleva el líquido', () => {
    const d = { ...docVacio('honorario', '2026-10-21'), rut: '15488555-2', razon: 'Juan', folio: '12', bruto: 100000 };
    const t = totalesDoc('honorario', d);
    expect(t.retencion).toBe(Math.round(100000 * t.tasa));
    expect(t.montoLinea).toBe(100000 - t.retencion);
    expect(dtesDe('honorario').map((x) => x.cod)).toEqual([70, 71]);
    expect(totalesDoc('honorario', { ...d, tipoDTE: 71 }).montoLinea).toBe(100000);
  });
  it('validaciones', () => {
    expect(validarDocAux('cliente', docVacio('cliente', '2026-10-21'))).toEqual(['RUT no válido', 'Falta el folio', 'Falta la razón social', 'El total del documento debe ser mayor que cero']);
    expect(validarDocAux('proveedor', { ...docVacio('proveedor', '2026-10-21', 'existente'), rut: '77090370-K', folio: '1' })).toEqual([]);
  });
});
