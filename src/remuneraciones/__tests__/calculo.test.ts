import { describe, it, expect } from 'vitest';
import oro from '../__fixtures__/rem-oro.json';
import { asistenciaMes, liquidacionMes, type Trabajador, type EventoAsistencia, type ContextoRem } from '../calculo';
import { parametrosVigentes } from '../parametros';

const o = oro as unknown as { uf: number; utm: number; trabajadores: Trabajador[]; asistencia: { eventos: EventoAsistencia[]; horas: ContextoRem['horas'] }; libroRem: ContextoRem['libros']; casos: { mes: number; trab: string; asis: unknown; liq: unknown }[] };
const ctx: ContextoRem = { P: parametrosVigentes(), eventos: o.asistencia.eventos, horas: o.asistencia.horas, libros: o.libroRem };

describe('liquidaciones (igual al sistema actual)', () => {
  for (const c of o.casos) {
    const t = o.trabajadores.find((x) => x.id === c.trab)!;
    it(`${t.nombre} · mes ${c.mes}`, () => {
      expect(JSON.parse(JSON.stringify(asistenciaMes(t, 2026, c.mes, ctx.eventos, ctx.horas)))).toEqual(c.asis);
      expect(JSON.parse(JSON.stringify(liquidacionMes(t, o.uf, o.utm, 2026, c.mes, ctx)))).toEqual(c.liq);
    });
  }
});

import { lineaLibro, totalizar, asientoRemuneraciones, lineaVacia } from '../libro';
describe('libro y asiento de remuneraciones', () => {
  it('el asiento del mes cuadra y salda líquido, previsión e impuesto', () => {
    const lineas = o.trabajadores.map((t) => lineaLibro(t, liquidacionMes(t, o.uf, o.utm, 2026, 3, ctx), '2026-03')).filter((l) => !lineaVacia(l));
    expect(lineas.map((l) => l.id)).not.toContain('t8'); // terminó contrato en febrero
    const tot = totalizar(lineas);
    const a = asientoRemuneraciones(tot, 2026, 3);
    expect(a.cuadra).toBe(true);
    expect(a.fecha).toBe('2026-03-31');
    expect(a.lineas.find((l) => l.cuenta === '2104005')?.haber).toBe(tot.liquido);
    expect(a.lineas.find((l) => l.cuenta === '1106001')?.haber).toBe(150000);
    expect(a.lineas.find((l) => l.cuenta === '2104002')?.haber).toBe(tot.iusc);
  });
});
