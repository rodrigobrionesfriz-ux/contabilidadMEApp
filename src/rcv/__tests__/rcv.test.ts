import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { leerCSV, leerArchivoRCV } from '../leer';
import { validarDetalleRCV, lineasIniciales, completarLinea, type LineaDetalle } from '../detalle';
import { PlanCuentas } from '@/motor/plan-cuentas';
import pdc from '@/motor/__fixtures__/pdc-base.json';

const FX = path.resolve(__dirname, '../__fixtures__');
const leerFx = (f: string) => fs.readFileSync(path.join(FX, f), 'utf8');
const esperado = JSON.parse(leerFx('rcv-esperado.json'));
const oro = JSON.parse(leerFx('detalle-oro.json'));
const plan = new PlanCuentas(pdc);

describe('lector RCV (igual al sistema actual)', () => {
  it('compras', () => expect(leerCSV(leerFx('rcv-compras.csv'), 'compra')).toEqual(esperado.compras));
  it('ventas', () => expect(leerCSV(leerFx('rcv-ventas.csv'), 'venta')).toEqual(esperado.ventas));
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
  it('completar línea', () => {
    const d = { tipoDTE: 33, neto: 100000, exento: 0 };
    const ls: LineaDetalle[] = [{ cuenta: 'a', monto: 60000, afecto: true }, { cuenta: 'b', monto: 0, afecto: true }];
    expect(completarLinea('compra', d, ls, 1)).toBe(40000);
  });
});
