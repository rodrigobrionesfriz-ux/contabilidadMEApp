import { describe, expect, it } from 'vitest';
import { decimalCL, decimalTexto } from '../formato';

describe('decimalCL', () => {
  it('lee formato chileno y punto decimal', () => {
    expect(decimalCL('41.247,63')).toBe(41247.63);
    expect(decimalCL('41247,63')).toBe(41247.63);
    expect(decimalCL('41247.63')).toBe(41247.63);
    expect(decimalCL('4,5')).toBe(4.5);
    expect(decimalCL('69.889')).toBe(69889);
    expect(decimalCL('1.500.000')).toBe(1500000);
    expect(decimalCL('$ 1.000')).toBe(1000);
    expect(decimalCL('')).toBe(0);
    expect(decimalCL('abc')).toBe(0);
  });
  it('ida y vuelta con decimalTexto', () => {
    for (const n of [41247.63, 4.5, 0.125, 1.85, 69889]) expect(decimalCL(decimalTexto(n))).toBe(n);
  });
});
