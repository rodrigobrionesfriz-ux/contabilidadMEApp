import { describe, expect, it } from 'vitest';
import { rutDV, rutFmt, rutParse } from '../rut';

describe('RUT', () => {
  it('dígito verificador', () => {
    expect(rutDV('15488555')).toBe('2');
    expect(rutDV('77684700')).toBe('3');
    expect(rutDV('76151704')).toBe('K');
  });
  it('parse y formato', () => {
    expect(rutParse('15.488.555-2')).toMatchObject({ codigo: '15488555', dv: '2', valido: true });
    expect(rutParse('12.345.678-0').valido).toBe(false);
    expect(rutFmt('77684700', '3')).toBe('77.684.700-3');
  });
});
