import { describe, it, expect } from 'vitest';
import oro from '../__fixtures__/af-oro.json';
import { AF_CATEGORIAS, vidaAcelerada, calcularDepreciacionContable, calcularDepreciacionTributaria, conciliacionDepreciacionAF, asientoDepreciacion, afCat, type Bien } from '../depreciacion';

/* eslint-disable @typescript-eslint/no-explicit-any */
const o = oro as any;
const B = o.bienes as Bien[];
describe('activo fijo (igual al sistema actual)', () => {
  it('categorías y vida acelerada', () => {
    expect(AF_CATEGORIAS).toEqual(o.categorias);
    for (const [v, r] of o.acelerada) expect(vidaAcelerada(v)).toBe(r);
  });
  it('depreciación contable y tributaria por bien y año', () => {
    for (const c of o.calc) {
      const b = B.find((x) => x.id === c.id)!;
      expect(calcularDepreciacionContable(b, c.anio), `${c.id} ${c.anio}`).toEqual(c.c);
      expect(calcularDepreciacionTributaria(b, c.anio), `${c.id} ${c.anio} trib`).toEqual(c.t);
    }
  });
  it('conciliación para renta, normal e instantánea', () => {
    for (const [k, r] of Object.entries<any>(o.concil)) {
      const [y, inst] = k.split(':');
      expect(conciliacionDepreciacionAF(B, +y, { deprInstantanea: inst === 'true' })).toEqual(r);
    }
  });
  it('asiento de depreciación agrupado por cuenta y cuadrado', () => {
    const bs = B.map((b) => ({ ...b, cuentaGasto: afCat(b.cat).gasto, cuentaDeprAcum: afCat(b.cat).deprAcum }));
    const a = asientoDepreciacion(bs, 2026);
    expect(a.total).toBe(3000000 + 4000000 + 2857143 + 900000);
    expect(a.lineas.reduce((s, l) => s + l.debe, 0)).toBe(a.lineas.reduce((s, l) => s + l.haber, 0));
    expect(a.lineas.map((l) => l.cuenta)).toEqual(['3301002', '3301003', '3301004', '3301005', '1201202', '1201203', '1201204', '1201205']);
  });
});
