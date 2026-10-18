import { describe, it, expect } from 'vitest';
import oro from '../__fixtures__/renta-oro.json';
import { calcularRenta, normalizarRenta, motivoRechazo, filasExcelRenta } from '../renta';
import type { Bien } from '@/activo-fijo/depreciacion';

describe('renta anual (casos de oro del sistema actual)', () => {
  for (const c of oro.casos) {
    it(c.clave, () => {
      const datos = normalizarRenta(c.datos, c.regimen);
      const R = calcularRenta({ anio: 2026, M: c.saldos, datos, bienes: oro.bienes as Bien[], ppmF29: c.r.ppmF29, movRechazados: c.rechazoMov });
      const { reg, ...resto } = R;
      expect(reg.k).toBe(c.r.reg);
      const esperado = { ...c.r } as Record<string, unknown>;
      delete esperado.reg; delete esperado.M;
      // El sistema actual nombra la cuenta con el plan (sin plan en la prueba muestra el código) y dice «documento».
      esperado.ag = (c.r.ag as { lbl: string; nota?: string; cuenta?: string }[]).map((a) => a.lbl.startsWith('Gasto rechazado documentado')
        ? { ...a, lbl: a.lbl.replace(a.cuenta!, c.saldos[a.cuenta as keyof typeof c.saldos].nombre), nota: a.nota!.replace('a nivel de documento', 'a nivel de movimiento') } : a);
      expect(JSON.parse(JSON.stringify(resto))).toEqual(esperado);
    });
  }
  it('sugiere motivos de rechazo por nombre', () => {
    expect(motivoRechazo('Multas e infracciones')).toMatch(/Multas/);
    expect(motivoRechazo('Arriendos')).toBe('');
  });
  it('arma el Excel del F22', () => {
    const c = oro.casos[1];
    const datos = normalizarRenta(c.datos, c.regimen);
    const R = calcularRenta({ anio: 2026, M: c.saldos, datos, bienes: oro.bienes as Bien[], ppmF29: 0, movRechazados: c.rechazoMov });
    const x = filasExcelRenta(R, { nombre: 'X', rut: '76.123.456-7' }, c.saldos, datos);
    expect(x.nombre).toBe('F22_AT2027_761234567.xlsx');
    expect(x.rechazados?.length).toBe(3);
    expect(x.f22.some((f) => f[1] === 'RENTA LÍQUIDA IMPONIBLE' || f[1] === 'PÉRDIDA TRIBUTARIA DEL EJERCICIO')).toBe(true);
  });
});
