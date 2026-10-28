import { describe, it, expect } from 'vitest';
import { milesInput, decimalInput, decimalCL } from '../formato';

describe('montos mientras se digitan', () => {
  it('miles sin decimales', () => {
    expect(milesInput(176181)).toBe('176.181');
    expect(milesInput('67429')).toBe('67.429');
    expect(milesInput('1.234.5678')).toBe('12.345.678');
    expect(milesInput(12345.6)).toBe('12.346');
    expect(milesInput('-5000')).toBe('-5.000');
  });
  it('decimales a la chilena', () => {
    expect(decimalInput(39643.59)).toBe('39.643,59');
    expect(decimalInput('39643,5')).toBe('39.643,5');
    expect(decimalInput('39.643.')).toBe('39.643,');
    expect(decimalInput('2.5')).toBe('25');
    expect(decimalInput('1.234,567', 2)).toBe('1.234,56');
    expect(decimalInput(',5')).toBe('0,5');
    expect(decimalInput('')).toBe('');
  });
  it('lo formateado se lee de vuelta', () => {
    for (const n of [0.5, 12, 1234, 39643.59, 1234567.25]) expect(decimalCL(decimalInput(n))).toBe(n);
    expect(decimalCL(milesInput(176181))).toBe(176181);
  });
});
