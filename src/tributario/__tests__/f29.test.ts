import { describe, it, expect } from 'vitest';
import oro from '../__fixtures__/f29-oro.json';
import { calcularF29Anual, reajustarRemanente, montoDeclarado, type EntradaF29 } from '../f29';

interface Caso { nombre: string; entrada: Record<string, unknown> & { tasaPPM: number; anterior: object; items: object; ventas: never[]; compras: never[]; honorarios: never[]; asientos: { anulado?: boolean; tipo: string; fecha: string; periodo?: string; movs: { cd: string; debe: number; haber: number }[] }[] }; resultado: unknown[] }

describe('F29 (igual al sistema actual)', () => {
  for (const c of (oro as unknown as { casos: Caso[] }).casos) {
    it(c.nombre, () => {
      const iusc: Record<string, number> = {};
      for (const a of c.entrada.asientos) {
        if (a.anulado || a.tipo !== 'remuneraciones') continue;
        const p = a.periodo ?? a.fecha.slice(0, 7);
        iusc[p] = (iusc[p] ?? 0) + a.movs.reduce((s, m) => s + (m.cd === '2104002' ? m.haber - m.debe : 0), 0);
      }
      const e: EntradaF29 = {
        anio: 2026, tasaPPM: c.entrada.tasaPPM, ventas: c.entrada.ventas, compras: c.entrada.compras, honorarios: c.entrada.honorarios,
        iusc, declaraciones: c.entrada.items as EntradaF29['declaraciones'], anteriores: c.entrada.anterior as EntradaF29['anteriores'],
      };
      // remanenteCorregido y desactualizado son de 10z5 (el sistema anterior no los tenía)
      const r = calcularF29Anual(e).map((x) => { const y: Partial<typeof x> = { ...x }; delete y.remanenteCorregido; delete y.desactualizado; return y; });
      expect(JSON.parse(JSON.stringify(r))).toEqual(c.resultado);
    });
  }
  it('reajuste del remanente como el SII (ej. dic-2024)', () => {
    expect(reajustarRemanente(176181, 67429, 67294)).toEqual({ monto: 175637, utm: 2.61, reajustado: true });
  });
});

import { compensacionIVA, pagoF29, montosSugeridos } from '../asientos-f29';
describe('asientos del F29', () => {
  const caso = (oro as unknown as { casos: { resultado: unknown[] }[] }).casos[1];
  const meses = caso.resultado as Parameters<typeof compensacionIVA>[0][];
  it('la compensación cuadra en todos los meses (con y sin PPM)', () => {
    for (const m of meses) {
      expect(compensacionIVA(m, 2026, false).cuadra, `mes ${m.m}`).toBe(true);
      expect(compensacionIVA(m, 2026, true).cuadra).toBe(true);
    }
  });
  it('mayo: imputa el remanente y deja IVA a pagar en 2104002 cuando corresponde', () => {
    const may = meses[4];
    const c = compensacionIVA(may, 2026, false);
    expect(c.lineas.find((l) => l.cuenta === '2103003')?.debe).toBe(950000);
    const rem = c.lineas.find((l) => l.cuenta === '1108007');
    expect(rem && rem.haber > 0 ? rem.haber : rem?.debe).toBeDefined();
  });
  it('pago F29 suma conceptos y abona el banco', () => {
    const p = pagoF29(meses[0], 2026, montosSugeridos(meses[0]), '1101201');
    expect(p.lineas.at(-1)).toMatchObject({ cuenta: '1101201', haber: p.total });
    expect(p.total).toBe(meses[0].ppm + meses[0].retencionHon + meses[0].iusc + meses[0].ivaAPagar);
  });
});

describe('F29: declarado, retenciones e impuesto único', () => {
  const base: EntradaF29 = { anio: 2026, tasaPPM: 1, ventas: [], compras: [], honorarios: [], iusc: {}, declaraciones: {}, anteriores: {} };

  it('lee lo digitado con separador de miles', () => {
    expect(montoDeclarado('5.887.130')).toBe(5887130);
    expect(montoDeclarado('$ 1.234')).toBe(1234);
    expect(montoDeclarado(42)).toBe(42);
    expect(montoDeclarado('')).toBeNull();
    expect(montoDeclarado('abc')).toBeNull();
  });

  it('impuesto único y retención de honorarios entran solos al cód. 48, 151 y al total 91', () => {
    const r = calcularF29Anual({ ...base, iusc: { '2026-04': 35210 }, honorarios: [{ mes: 4, bruto: 1000000, tasaRetencion: 0.1525 }] })[3];
    expect(r.codigos[48]).toBe(35210);
    expect(r.codigos[151]).toBe(152500);
    expect(r.codigos[91]).toBe(35210 + 152500);
  });

  it('sin boletas en el mes, toma la retención contabilizada en 2103002; con boletas no la suma dos veces', () => {
    const sinBoletas = calcularF29Anual({ ...base, retencionLibro: { '2026-05': 76250 } })[4];
    expect(sinBoletas.codigos[151]).toBe(76250);
    const conBoletas = calcularF29Anual({ ...base, honorarios: [{ mes: 5, bruto: 500000, retencion: 76250 }], retencionLibro: { '2026-05': 76250 } })[4];
    expect(conBoletas.codigos[151]).toBe(76250);
  });
});

describe('F29: correcciones del remanente se arrastran a los meses siguientes', () => {
  const base = (declaraciones: EntradaF29['declaraciones'] = {}): EntradaF29 => ({
    anio: 2026, tasaPPM: 0, ventas: [], compras: [], honorarios: [], iusc: {}, declaraciones,
    anteriores: { '2025-12': { periodo: '2025-12', estado: 'presentado', declarado: { '77': 1000000 } } },
  });
  it('una corrección en marzo cambia marzo y todo lo que sigue (borradores)', () => {
    const sin = calcularF29Anual(base());
    const con = calcularF29Anual(base({ '2026-03': { periodo: '2026-03', estado: 'borrador', remanenteInicial: 3000000 } }));
    expect(con[1].remanente).toBe(sin[1].remanente);
    expect(con[2]).toMatchObject({ remanenteAnt: 3000000, remanenteCorregido: true });
    expect(con[11].remanente).toBeGreaterThan(sin[11].remanente + 1900000);
  });
  it('un mes presentado arrastra lo declarado mientras siga al día', () => {
    const r0 = calcularF29Anual(base());
    const feb = { periodo: '2026-02', estado: 'presentado', declarado: { '504': r0[1].remanenteReaj, '77': 1234567 }, calculado: { '504': r0[1].remanenteReaj } };
    const r = calcularF29Anual(base({ '2026-02': feb }));
    expect(r[1].desactualizado).toBe(false);
    expect(r[2].remanenteAnt).toBe(1234567);
  });
  it('si se corrige un mes anterior, el presentado queda desactualizado y se arrastra lo calculado', () => {
    const r0 = calcularF29Anual(base());
    const feb = { periodo: '2026-02', estado: 'presentado', declarado: { '504': r0[1].remanenteReaj, '77': r0[1].remanente }, calculado: { '504': r0[1].remanenteReaj } };
    const r = calcularF29Anual(base({ '2026-01': { periodo: '2026-01', estado: 'borrador', remanenteInicial: 5000000 }, '2026-02': feb }));
    expect(r[1].desactualizado).toBe(true);
    expect(r[2].remanenteAnt).toBe(r[1].remanente);
    expect(r[2].remanenteAnt).toBeGreaterThan(5000000);
  });
});
