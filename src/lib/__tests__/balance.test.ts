import { describe, it, expect } from 'vitest';
import { balance8 } from '../balance';

describe('balance de 8 columnas', () => {
  it('clasifica y cuadra con el resultado del ejercicio', () => {
    const b = balance8([
      { cuenta: '1101201', nombre: 'Banco', tipo: 'A', debe: 1000, haber: 300 },
      { cuenta: '2301001', nombre: 'Capital', tipo: 'P', debe: 0, haber: 500 },
      { cuenta: '3202010', nombre: 'Gasto', tipo: 'C', debe: 100, haber: 0 },
      { cuenta: '4101002', nombre: 'Venta', tipo: 'I', debe: 0, haber: 300 },
    ]);
    expect(b.sumas.debe).toBe(b.sumas.haber);
    expect(b.sumas.deudor).toBe(b.sumas.acreedor);
    expect(b.resultado).toBe(200);
    // activo − pasivo = utilidad
    expect(b.sumas.activo - b.sumas.pasivo).toBe(b.resultado);
  });
});

import { clp } from '../formato';
describe('formato CLP', () => {
  it('pone el signo antes del peso', () => {
    expect(clp(-368577)).toBe('-$368.577');
    expect(clp(1234567.6)).toBe('$1.234.568');
  });
});

import { numeroALetras } from '../numletras';
describe('montos en palabras', () => {
  it('como el sistema actual', () => {
    expect(numeroALetras(698475)).toBe('seiscientos noventa y ocho mil cuatrocientos setenta y cinco pesos');
    expect(numeroALetras(2000000)).toBe('dos millones de pesos');
    expect(numeroALetras(1)).toBe('un peso');
    expect(numeroALetras(21100)).toBe('veintiún mil cien pesos');
  });
});
