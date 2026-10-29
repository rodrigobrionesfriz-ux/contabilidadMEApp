import { describe, it, expect } from 'vitest';
import { datosDelNombre, errorArchivoRCV } from '../archivo';

describe('nombre del archivo RCV', () => {
  it('lee RUT, tipo y período', () => {
    expect(datosDelNombre('RCV_COMPRA_REGISTRO_77684700-3_202607.csv')).toEqual({ rut: '77684700-3', tipo: 'compra', periodo: '2026-07' });
    expect(datosDelNombre('RCV_VENTA_78238896-7_202607 (1).csv')).toEqual({ rut: '78238896-7', tipo: 'venta', periodo: '2026-07' });
    expect(datosDelNombre('compras julio.xlsx')).toEqual({});
  });
  it('rechaza el RCV de otra empresa', () => {
    expect(errorArchivoRCV('RCV_COMPRA_REGISTRO_77684700-3_202607.csv', 'compra', '78.238.896-7')).toMatch(/77\.684\.700-3.*78\.238\.896-7/);
    expect(errorArchivoRCV('RCV_COMPRA_REGISTRO_77684700-3_202607.csv', 'compra', '77684700-3')).toBeNull();
    expect(errorArchivoRCV('RCV_COMPRA_REGISTRO_77684700-3_202607.csv', 'compra', '77.684.700-3')).toBeNull();
  });
  it('rechaza el libro equivocado y deja pasar nombres sin datos', () => {
    expect(errorArchivoRCV('RCV_VENTA_77684700-3_202607.csv', 'compra', '77684700-3')).toMatch(/ventas/);
    expect(errorArchivoRCV('mi archivo.csv', 'compra', '77684700-3')).toBeNull();
  });
});
