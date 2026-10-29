import { describe, it, expect } from 'vitest';
import { indiceAsiento, puntaje, type AsientoBusqueda } from '../buscar-asientos';

const a: AsientoBusqueda = { id: '1', numero: 41, fecha: '2026-07-01', glosa: 'Soc Comercial Carrasco · Factura N°180911', tipo: 'compra', anulado: false, asiento_lineas: [
  { cuenta: '3204001', debe: 1100264, haber: 0, glosa: 'Diesel', centro_costo: 'ADM', rut_auxiliar: null },
  { cuenta: '1108002', debe: 209048, haber: 0, glosa: null, centro_costo: null, rut_auxiliar: null },
  { cuenta: '2102001', debe: 0, haber: 1309312, glosa: null, centro_costo: null, rut_auxiliar: '76123456-7', folio: '180911' },
] };
const ix = indiceAsiento(a, (c) => ({ '3204001': 'COMBUSTIBLE' } as Record<string, string>)[c]);

describe('buscador de comprobantes', () => {
  it('por número', () => { expect(puntaje(ix, '41')).toBeGreaterThan(0); expect(puntaje(ix, '42')).toBe(0); });
  it('por monto con o sin puntos', () => {
    expect(puntaje(ix, '1.100.264')).toBeGreaterThan(0);
    expect(puntaje(ix, '$209048')).toBeGreaterThan(0);
    expect(puntaje(ix, '1309')).toBeGreaterThan(0);
    expect(puntaje(ix, '999.999')).toBe(0);
  });
  it('por texto sin tildes ni mayúsculas, todas las palabras', () => {
    expect(puntaje(ix, 'diesel carrasco')).toBeGreaterThan(0);
    expect(puntaje(ix, 'combustible')).toBeGreaterThan(0);
    expect(puntaje(ix, 'diesel arriendo')).toBe(0);
  });
  it('por RUT o folio', () => { expect(puntaje(ix, '76123456')).toBeGreaterThan(0); expect(puntaje(ix, '180911')).toBeGreaterThan(0); });
  it('el N° exacto pesa más que un monto parecido', () => expect(puntaje(ix, '41')).toBeGreaterThan(puntaje(ix, '1309')));
});
