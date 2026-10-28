import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { leerRespaldo } from '../leer-excel';
import { construirPlanCarga } from '../respaldo';
import pdc from '@/motor/__fixtures__/pdc-base.json';

const FX = path.resolve(__dirname, '../__fixtures__');
const esperado = JSON.parse(fs.readFileSync(path.join(FX, 'mayor-esperado.json'), 'utf8')) as {
  mayor: Record<string, { debe: number; haber: number }>;
};

describe('importador del respaldo Excel', () => {
  const hojas = leerRespaldo(fs.readFileSync(path.join(FX, 'respaldo-2026.xlsx')));
  const plan = construirPlanCarga(hojas, pdc);

  it('lee empresa y año', () => {
    expect(plan.anio).toBe(2026);
    expect(plan.empresa.rut).toBe('76151704-K');
  });

  it('el saldo de cada cuenta es igual al mayor del sistema actual', () => {
    const cuentas = new Set([...Object.keys(esperado.mayor), ...Object.keys(plan.totales)]);
    for (const cd of cuentas) {
      const e = esperado.mayor[cd] ?? { debe: 0, haber: 0 };
      const t = plan.totales[cd] ?? { debe: 0, haber: 0 };
      expect(Math.abs(t.debe - t.haber - (e.debe - e.haber)), `cuenta ${cd}`).toBeLessThanOrEqual(1);
    }
  });

  it('cada asiento cuadra en pesos enteros y sin montos negativos', () => {
    for (const a of plan.asientos) {
      const d = a.lineas.reduce((s, l) => s + l.debe, 0);
      const h = a.lineas.reduce((s, l) => s + l.haber, 0);
      expect(d, `N° ${a.numero}`).toBe(h);
      for (const l of a.lineas) {
        expect(Number.isInteger(l.debe) && Number.isInteger(l.haber)).toBe(true);
        expect(l.debe >= 0 && l.haber >= 0).toBe(true);
      }
    }
  });

  it('respeta números originales, renumera repetidos y numera los generados después', () => {
    const porRef = new Map(plan.asientos.map((a) => [a.ref, a]));
    expect(porRef.get('apertura:2026')?.numero).toBe(0);
    expect(porRef.get('a1')?.numero).toBe(1);
    expect(porRef.get('a5')?.numero).toBe(9);
    expect(porRef.get('a3')).toMatchObject({ numero: 3, anulado: true });
    expect(porRef.get('a4')!.numero).toBeGreaterThan(10); // N°3 repetido
    const nums = plan.asientos.map((a) => a.numero);
    expect(new Set(nums).size).toBe(nums.length);
    expect(plan.resumen.renumerados).toBe(1);
    expect(plan.problemas.some((p) => p.mensaje.includes('N° 3 está repetido'))).toBe(true);
  });

  it('no duplica documentos con asiento guardado ni contabiliza anulados o excluidos', () => {
    const refs = plan.asientos.map((a) => a.ref);
    expect(refs).not.toContain('auto:compras:c6'); // tiene asiento persistido a5
    expect(refs).not.toContain('auto:compras:c5'); // anulado
    expect(refs).not.toContain('auto:ventas:v4'); // excluidoAuto
    expect(refs).not.toContain('auto:honorarios:h2'); // anulado
    expect(refs).toContain('auto:honorarios:h1');
    expect(plan.documentos.find((d) => d.ref === 'c6')?.asiento_ref).toBe('a5');
    expect(plan.documentos.find((d) => d.ref === 'c5')?.asiento_ref).toBeUndefined();
    expect(plan.documentos).toHaveLength(12);
  });

  it('trae cuenta propia, centros de costo y cierres', () => {
    expect(plan.cuentas.map((c) => c.codigo)).toEqual(['3202999']);
    expect(plan.centros.find((c) => c.ref === 'cc_b')).toMatchObject({ nivel: 2, padre_ref: 'cc_a', codigo: 'FES-1' });
    expect(plan.cierres).toEqual(['2026-01']);
    expect(plan.problemas.filter((p) => p.nivel === 'error')).toEqual([]);
  });
});

describe('importador: asientos automáticos y celdas dañadas', () => {
  const base = { Empresa: [['Empresa', 'Prueba'], ['RUT', '76151704-K'], ['Año', 2026]] };
  const fila = (a: Record<string, unknown>) => ({ id: a.id, fecha: a.fecha, glosa: a.glosa, asientoJSON: JSON.stringify(a) });
  const movs = [{ cd: '2103003', debe: 100, haber: 0 }, { cd: '2104002', debe: 0, haber: 100 }];

  it('reconoce la compensación y el pago del F29 y las remuneraciones del sistema actual', () => {
    const plan = construirPlanCarga({ ...base, Asientos: [
      fila({ id: 'as_iva_1', numeroContable: 10, fecha: '2026-01-31', glosa: 'Compensación IVA Enero 2026 — F29', tipo: 'tributario', origenAuto: 'ivaf29', periodoIVA: '2026-01', movs }),
      fila({ id: 'as_pagof29_1', numeroContable: 11, fecha: '2026-02-12', glosa: 'Pago F29 Enero 2026', tipo: 'tributario', origenAuto: 'pagof29', periodoIVA: '2026-01',
        movs: [{ cd: '2104002', debe: 100 }, { cd: '1101201', haber: 100 }] }),
      fila({ id: 'as_rem_1', numeroContable: 12, fecha: '2026-09-30', glosa: 'Remuneraciones Septiembre 2026', tipo: 'remuneraciones', periodo: '2026-09',
        movs: [{ cd: '3201001', debe: 50 }, { cd: '2104005', haber: 50 }] }),
      fila({ id: 'a_man', numeroContable: 13, fecha: '2026-03-01', glosa: 'Manual', tipo: 'manual', movs }),
    ] }, pdc);
    const origen = Object.fromEntries(plan.asientos.map((a) => [a.ref, a.origen_id]));
    expect(origen).toEqual({ as_iva_1: 'ivaf29:2026-01', as_pagof29_1: 'pagof29:2026-01', as_rem_1: 'rem:2026-09', a_man: undefined });
    expect(plan.problemas.filter((p) => p.nivel === 'error')).toEqual([]);
  });

  it('un asiento con el JSON cortado bloquea la importación en vez de omitirse', () => {
    const largo = JSON.stringify({ id: 'a_pag', numeroContable: 20, fecha: '2026-09-15', glosa: 'Pago proveedores', tipo: 'pago', movs });
    const plan = construirPlanCarga({ ...base, Asientos: [
      { id: 'a_pag', fecha: '2026-09-15', glosa: 'Pago proveedores', asientoJSON: largo.slice(0, 40), movsJSON: JSON.stringify(movs).slice(0, 30) },
    ] }, pdc);
    expect(plan.problemas.some((p) => p.nivel === 'error' && p.mensaje.includes('cortado o dañado'))).toBe(true);
  });
});

describe('apertura del sistema anterior', () => {
  const base = leerRespaldo(fs.readFileSync(path.join(FX, 'respaldo-2026.xlsx')));
  const conApertura = (fecha: string, movs: unknown[]) => ({
    ...base,
    PlanDeCuentas: (base.PlanDeCuentas ?? []).filter((f) => String(f['Código']).replace(/\D/g, '') !== '2102008'),
    Apertura: [{ fecha, glosa: 'Balance de apertura', movsJSON: JSON.stringify(movs) }],
  });
  const movs = [
    { cd: '1101101', nm: 'CAJA', debe: 5500000, haber: 0 },
    { cd: '2102008', nm: 'OTROS DOCUMENTOS POR PAGAR', debe: 0, haber: 5500000 },
  ];

  it('una apertura fechada el 31-12 del año anterior se trae al 01-01', () => {
    const p = construirPlanCarga(conApertura('2025-12-31', movs), pdc);
    expect(p.asientos.find((a) => a.numero === 0)?.fecha).toBe('2026-01-01');
    expect(p.problemas.filter((x) => x.nivel === 'error')).toEqual([]);
  });

  it('una cuenta usada en la apertura y ausente del plan se crea como cuenta propia', () => {
    const p = construirPlanCarga(conApertura('2026-01-01', movs), pdc);
    expect(p.cuentas).toContainEqual({ codigo: '2102008', nombre: 'OTROS DOCUMENTOS POR PAGAR', tipo: 'P', naturaleza: 'C' });
    expect(p.asientos.find((a) => a.numero === 0)?.lineas.some((l) => l.cuenta === '2102008')).toBe(true);
  });
});
