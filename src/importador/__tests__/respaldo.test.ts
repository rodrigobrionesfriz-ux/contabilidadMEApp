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
