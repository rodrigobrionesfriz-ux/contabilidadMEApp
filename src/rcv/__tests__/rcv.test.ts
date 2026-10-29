import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { leerCSV, leerArchivoRCV, type LecturaRCV } from '../leer';
import { validarDetalleRCV, lineasIniciales, completarLinea, type LineaDetalle } from '../detalle';
import { PlanCuentas } from '@/motor/plan-cuentas';
import pdc from '@/motor/__fixtures__/pdc-base.json';

const FX = path.resolve(__dirname, '../__fixtures__');
const leerFx = (f: string) => fs.readFileSync(path.join(FX, f), 'utf8');
const esperado = JSON.parse(leerFx('rcv-esperado.json'));
const oro = JSON.parse(leerFx('detalle-oro.json'));
const plan = new PlanCuentas(pdc);

/** Lo comparable con el sistema actual: sin el registro SII completo ni las filas descartadas (agregados en Next) */
const comoActual = (r: LecturaRCV) => ({
  docs: r.docs.map((d) => { const c = { ...d }; delete c.registroSII; return c; }), descartados: r.descartados, continuaciones: r.continuaciones,
});

describe('lector RCV (igual al sistema actual)', () => {
  it('compras', () => expect(comoActual(leerCSV(leerFx('rcv-compras.csv'), 'compra'))).toEqual(esperado.compras));
  it('ventas', () => expect(comoActual(leerCSV(leerFx('rcv-ventas.csv'), 'venta'))).toEqual(esperado.ventas));
  it('guarda el registro completo del SII de cada documento (con sus filas de continuación) y las filas descartadas', () => {
    const r = leerCSV(leerFx('rcv-compras.csv'), 'compra');
    const enc = leerFx('rcv-compras.csv').replace(/^\uFEFF/, '').split(/\r?\n/).find((l) => /tipo doc/i.test(l))!.split(';').map((h) => h.trim().replace(/"/g, ''));
    for (const d of r.docs) {
      expect(d.registroSII?.length).toBeGreaterThanOrEqual(1);
      const fila = d.registroSII![0];
      for (const k of Object.keys(fila)) expect(enc).toContain(k);
      expect(Object.values(fila)).toContain(d.numero);
    }
    expect(r.docs.reduce((s, d) => s + (d.registroSII!.length - 1), 0)).toBeGreaterThanOrEqual(r.continuaciones);
    expect(r.filasDescartadas?.length).toBe(r.descartados);
    for (const f of r.filasDescartadas ?? []) expect(f.motivo).toBeTruthy();
  });
  it('acepta archivos en Windows-1252', async () => {
    const latin1 = Buffer.from(leerFx('rcv-compras.csv'), 'latin1');
    const r = await leerArchivoRCV('rcv.csv', latin1.buffer.slice(latin1.byteOffset, latin1.byteOffset + latin1.byteLength), 'compra');
    expect(r.docs.find((d) => d.numero === '2001')?.razonSocial).toBe('Ferretería Dos');
  });
  it('rechaza un archivo que no es del SII', () => {
    expect(() => leerCSV('a;b;c\n1;2;3', 'compra')).toThrow(/encabezados/);
  });
});

describe('validador del paso 2 (igual al sistema actual)', () => {
  for (const c of oro.validador) {
    it(c.nombre, () => {
      expect(validarDetalleRCV(c.tipo, c.doc, c.lineas, plan, c.opts)).toEqual(c.resultado);
    });
  }
  for (const c of oro.lineas) {
    it(`líneas iniciales: ${c.nombre}`, () => expect(lineasIniciales(c.tipo, c.d)).toEqual(c.resultado));
  }
  it('manda el RCV: IVA del SII distinto del 19% calculado no impide contabilizar', () => {
    // Caso real 29/10: neto 1.100.264, IVA RCV 209.048 (19% = 209.050), otros 423.243, total 1.732.555
    const doc = { tipoDTE: 33, neto: 1100264, exento: 0, iva: 209048, otrosImpuestos: 423243, total: 1732555 };
    const ls: LineaDetalle[] = [
      { cuenta: '3202010', desc: 'Diesel', monto: 1100264, afecto: true },
      { cuenta: '3202010', desc: 'Otro impuesto cód. 35', monto: 358176, afecto: false, otroImp: true },
      { cuenta: '3202010', desc: 'Otro impuesto cód. 28', monto: 65067, afecto: false, otroImp: true },
    ];
    const r = validarDetalleRCV('compra', doc, ls, plan);
    expect(r.errores).toEqual([]);
    expect(r.avisos[0]).toMatch(/se contabiliza el IVA del RCV/);
  });
  it('manda el RCV: si su total no suma, se avisa y se respeta el total', () => {
    const r = validarDetalleRCV('compra', { tipoDTE: 33, neto: 100000, exento: 0, iva: 19000, total: 119005 }, [{ cuenta: '3202010', monto: 100000, afecto: true }], plan);
    expect(r.ok).toBe(true);
    expect(r.avisos.join(' ')).toMatch(/se contabiliza el total del RCV/);
  });
  it('completar línea', () => {
    const d = { tipoDTE: 33, neto: 100000, exento: 0 };
    const ls: LineaDetalle[] = [{ cuenta: 'a', monto: 60000, afecto: true }, { cuenta: 'b', monto: 0, afecto: true }];
    expect(completarLinea('compra', d, ls, 1)).toBe(40000);
  });
});
