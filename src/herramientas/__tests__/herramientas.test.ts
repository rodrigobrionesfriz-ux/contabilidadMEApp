import { describe, it, expect } from 'vitest';
import oro from '../__fixtures__/f10-oro.json';
import { construirImposiciones, hojasImposiciones } from '../imposiciones';
import { parametrosVigentes, type Patronal } from '@/remuneraciones/parametros';
import { buscarComprobantes, lineasDesdeComprobante, repartir, resumenComprobante, prepararComprobante, repartirIgual, pideMontoDist, type ComprobanteTipo } from '../comprobantes-tipo';
import { filasDiario, filasCaja, filasMayor, filasInventario, paginar, siguienteBloque, resumenRango, filasControl, normalizarConfig } from '../folios';

const J = (x: unknown) => JSON.parse(JSON.stringify(x));

describe('imposiciones (casos de oro)', () => {
  for (const r of oro.imposiciones) {
    it(`${r.caja} ${r.libro.periodo}`, () => {
      const P = parametrosVigentes({ previsional: { patronal: r.patronal as Patronal } });
      const I = construirImposiciones(r.libro, P);
      const { libro: _l, ...resto } = I; void _l;
      expect(J(resto)).toEqual(r.out);
      const h = hojasImposiciones(I, { nombre: 'X', rut: '1-9' }, 'Marzo 2026');
      expect(h.detalle.length).toBe(I.detalle.length + 4);
    });
  }
});

describe('comprobantes tipo (casos de oro)', () => {
  const lista = oro.ct.lista as unknown as ComprobanteTipo[];
  // Nombres del plan de cuentas que usó el sistema actual
  const nombres = new Map(oro.ct.lineas.flatMap((x) => x.lineas.map((l) => [l.cd, l.nm] as [string, string])));
  const nm = (cd: string) => nombres.get(cd) || '';
  it('aplica la plantilla con y sin distribución', () => {
    const pedidos: [number, number | null][] = [[0, null], [1, null], [1, 1000000], [1, 7], [2, null], [2, 50]];
    pedidos.forEach(([i, m], k) => expect(J(lineasDesdeComprobante(lista[i], m, nm))).toEqual(oro.ct.lineas[k]));
    expect(lista.map((c) => pideMontoDist(c))).toEqual([false, true, false]);
  });
  it('resume, busca y reparte', () => {
    expect(lista.map(resumenComprobante)).toEqual(oro.ct.resumen);
    ['arriendo', 'luz consumo', '3202010', 'oficina mensual', 'xyz', ''].forEach((q, i) => expect(buscarComprobantes(lista, q).map((c) => c.nombre)).toEqual(oro.ct.buscar[i]));
    ([[100, [33.33, 33.33, 33.34]], [0, [50, 50]], [1001, [50, 50]], [-300, [10, 90]]] as [number, number[]][]).forEach(([t, p], i) => expect(repartir(t, p)).toEqual(oro.ct.repartir[i]));
  });
  it('valida al guardar', () => {
    expect(prepararComprobante({ nombre: ' ', descripcion: '', glosa: '', guardaMontos: false, lineas: [], distActiva: false, distBase: 0, dist: [] })).toEqual({ error: 'Ponle un nombre al comprobante' });
    expect(prepararComprobante({ nombre: 'X', descripcion: '', glosa: '', guardaMontos: false, lineas: [{ cd: '', desc: '', debe: 0, haber: 0, cc: '' }], distActiva: false, distBase: 0, dist: [] })).toMatchObject({ error: expect.stringMatching(/vacía/) });
    expect(prepararComprobante({ nombre: 'X', descripcion: '', glosa: '', guardaMontos: false, lineas: [], distActiva: true, distBase: 0, dist: [{ cd: '3101001', pct: 60, cc: '' }, { cd: '3101002', pct: 30, cc: '' }] })).toEqual({ error: 'La distribución suma 90%: debe sumar 100%' });
    const ok = prepararComprobante({ nombre: ' Luz ', descripcion: '', glosa: '', guardaMontos: false, lineas: [{ cd: '2102001', desc: '', debe: 500, haber: 0, cc: '' }, { cd: '', desc: '', debe: 0, haber: 0, cc: '' }], distActiva: false, distBase: 9, dist: [] });
    expect(ok).toEqual({ datos: { nombre: 'Luz', descripcion: '', glosa: '', guardaMontos: false, lineas: [{ cd: '2102001', desc: '', debe: 0, haber: 0, cc: '' }], distActiva: false, distBase: 0, dist: [] } });
    expect(repartirIgual([{ cd: 'a', pct: 0, cc: '' }, { cd: '', pct: 0, cc: '' }, { cd: 'b', pct: 0, cc: '' }, { cd: 'c', pct: 0, cc: '' }]).map((d) => d.pct)).toEqual([33.33, 0, 33.33, 33.34]);
  });
});

describe('hojas foliadas', () => {
  const asientos = [{ numero: 1, fecha: '2026-01-02', glosa: 'Venta', lineas: [{ cuenta: '1101101', nombre: 'Caja', glosa: null, debe: 100, haber: 0 }, { cuenta: '4101001', nombre: 'Ventas', glosa: 'neto', debe: 0, haber: 100 }] }];
  it('arma filas de diario, caja, mayor e inventario', () => {
    expect(filasDiario(asientos)).toEqual([{ tipo: 'mov', fecha: '2026-01-02', n: 1, cuenta: '1101101 Caja', glosa: 'Venta', debe: 100, haber: 0 }, { tipo: 'mov', fecha: '', n: '', cuenta: '4101001 Ventas', glosa: 'neto', debe: 0, haber: 100 }]);
    expect(filasCaja(asientos)).toHaveLength(1);
    const m = filasMayor([{ cd: '1101101', nm: 'Caja', saldoAnterior: 50, movs: [{ fecha: '2026-01-02', n: 1, glosa: 'Venta', debe: 100, haber: 30 }] }, { cd: '9', nm: 'Vacía', saldoAnterior: 0, movs: [] }]);
    expect(m.at(-1)).toEqual({ tipo: 'totalMayor', debe: 100, haber: 30, saldo: 120 });
    expect(filasInventario([{ cd: '2', nm: 'B', saldo: -5 }, { cd: '1', nm: 'A', saldo: 5 }, { cd: '3', nm: 'C', saldo: 0 }]).map((f) => f.tipo === 'inv' && [f.cd, f.debe, f.haber])).toEqual([['1', 5, 0], ['2', 0, 5]]);
    expect(paginar([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(paginar([], 2)).toEqual([[]]);
  });
  it('busca bloques libres y resume el rango', () => {
    const rango = { id: 'r', desde: 100, hasta: 110, activo: true, fechaAutorizacion: null };
    const res = [{ id: 'a', folios: [102, 103], estado: 'usado' as const }, { id: 'b', folios: [106], estado: 'inutilizado' as const }];
    expect(siguienteBloque(rango, res, 2)).toEqual([100, 101]);
    expect(siguienteBloque(rango, res, 3)).toEqual([107, 108, 109]);
    expect(siguienteBloque(rango, res, 6)).toBeNull();
    expect(resumenRango(rango, res)).toEqual({ total: 11, usados: 2, reservados: 0, inutilizados: 1, libres: 8 });
    expect(filasControl([rango], [{ ...res[0], libro: 'diario', desde: '2026-01-01', hasta: '2026-01-31', creado: 'x', usuario: 'u' }])[3]).toEqual([102, 'usado', 'Libro Diario', '2026-01-01 a 2026-01-31', 'x', 'u']);
    expect(normalizarConfig({ lineas: 99, margenSup: -3, papel: 'X' as never })).toMatchObject({ lineas: 42, margenSup: 0, papel: 'A4' });
  });
});
