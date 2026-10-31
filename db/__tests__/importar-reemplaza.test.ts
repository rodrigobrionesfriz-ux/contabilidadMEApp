import { describe, it, expect, beforeAll } from 'vitest';
import { baseDePrueba } from './helpers';
import { f29DesdeDatos } from '@/importador/respaldo';

const ADMIN = '11111111-1111-1111-1111-111111111111';

describe('importar un respaldo reemplaza el año', () => {
  let b: Awaited<ReturnType<typeof baseDePrueba>>;
  let emp: string;
  const j = (x: unknown) => JSON.stringify(x);
  const asiento = (numero: number, fecha: string, monto: number) => ({ numero, fecha, glosa: `A${numero}`, tipo: 'manual', ref: `r${fecha}-${numero}`, anulado: false,
    lineas: [{ cuenta: '1101201', debe: monto, haber: 0 }, { cuenta: '2303001', debe: 0, haber: monto }] });
  const importar = async (anio: number, asientos: unknown[]) => {
    const [{ id }] = await b.como<{ id: string }>(ADMIN, `select importar_iniciar($1, $2, 'r.xlsx') id`, [emp, anio]);
    await b.como(ADMIN, `select importar_asientos($1, $2)`, [id, j(asientos)]);
    await b.como(ADMIN, `select importar_finalizar($1, '[]', '{}')`, [id]);
  };
  const cuenta = (anio: number) => b.como<{ n: number; debe: number }>(ADMIN,
    `select count(distinct a.id)::int n, coalesce(sum(l.debe),0)::int debe from asientos a join asiento_lineas l on l.asiento_id=a.id where a.empresa_id=$1 and a.anio=$2`, [emp, anio]);

  beforeAll(async () => {
    b = await baseDePrueba();
    await b.db.exec(`insert into auth.users (id, email) values ('${ADMIN}', 'a@t.cl')`);
    emp = (await b.como<{ id: string }>(ADMIN, `select crear_empresa('76151704-K', 'Agrícola SpA') id`))[0].id;
  });

  it('borra lo importado y lo registrado en la app del año, y deja los otros años', async () => {
    await importar(2025, [asiento(1, '2025-03-01', 500)]);
    await importar(2026, [asiento(1, '2026-01-10', 100), asiento(2, '2026-02-10', 200)]);
    // Trabajo en paralelo en la app nueva: un asiento propio, un F29 y un mes cerrado
    await b.como(ADMIN, `select crear_asiento($1, '2026-03-05', 'propio', $2)`, [emp, j([{ cuenta: '1101201', debe: 50, haber: 0 }, { cuenta: '2303001', debe: 0, haber: 50 }])]);
    await b.db.exec(`insert into f29_declaraciones (empresa_id, periodo) values ('${emp}', '2026-03')`);
    await b.db.exec(`insert into periodos_cerrados (empresa_id, periodo) values ('${emp}', '2026-01')`);
    const [r] = await b.como<{ r: { propios: number; f29: number; meses_cerrados: number } }>(ADMIN, `select resumen_anio($1, 2026) r`, [emp]);
    expect(r.r).toMatchObject({ propios: 1, f29: 1, meses_cerrados: 1 });

    await importar(2026, [asiento(1, '2026-01-15', 300)]);
    expect(await cuenta(2026)).toEqual([{ n: 1, debe: 300 }]);
    expect(await cuenta(2025)).toEqual([{ n: 1, debe: 500 }]);
    expect(await b.como(ADMIN, `select count(*)::int n from f29_declaraciones where empresa_id=$1`, [emp])).toEqual([{ n: 0 }]);
    expect(await b.como(ADMIN, `select count(*)::int n from importaciones where empresa_id=$1 and anio=2026`, [emp])).toEqual([{ n: 1 }]);
    expect(await b.como(ADMIN, `select count(*)::int n from auditoria where accion='reemplazar_anio_importacion'`)).toEqual([{ n: 1 }]);
  });

  it('importar_f29 devuelve las declaraciones del respaldo (estado, declarado, ajustes) y la tasa PPM', async () => {
    const items = f29DesdeDatos(new Map([
      ['f29-declaraciones-2026', JSON.stringify({
        '2026-01': { periodo: '2026-01', estado: 'presentado', declarado: { 89: 871530, 91: 1373, 504: 871530, 573: 0 }, utm: 69751, presentadoEn: '2026-02-12T15:00:00Z',
          tasaPPM: 0.125, manual: { 111: 45000, 758: 7 }, anticipo: { 556: 910 }, remanenteAnticipoInicial: 3703, calculadoAlPresentar: { 89: 871530 } },
        '2026-02': { periodo: '2026-02', estado: 'borrador', declarado: {}, tasaPPM: 0.2, tasaPPMManual: true },
      })],
      ['f29-declaraciones-2025', JSON.stringify({ '2025-11': { estado: 'presentado', declarado: { 77: 1 } }, '2025-12': { estado: 'presentado', declarado: { 77: 0, 573: 3703 } } })],
    ]), 2026);
    expect(items.map((x) => x.periodo)).toEqual(['2025-12', '2026-01', '2026-02']);
    const [{ n }] = await b.como<{ n: number }>(ADMIN, `select importar_f29($1, $2, 0.125) n`, [emp, j(items)]);
    expect(n).toBe(3);
    const [ene] = await b.como<{ estado: string; declarado: Record<string, number>; utm: string; ajustes: Record<string, unknown>; calculado: Record<string, number> }>(ADMIN,
      `select estado, declarado, utm, ajustes, calculado from f29_declaraciones where empresa_id=$1 and periodo='2026-01'`, [emp]);
    expect(ene.estado).toBe('presentado');
    expect(ene.declarado).toMatchObject({ '89': 871530, '91': 1373, '573': 0 });
    expect(Number(ene.utm)).toBe(69751);
    expect(ene.ajustes).toEqual({ tasaPPM: 0.125, manual: { '111': 45000, '758': 7 }, anticipo: { '556': 910 }, remanenteAnticipoInicial: 3703 });
    expect(ene.calculado).toEqual({ '89': 871530 });
    const [feb] = await b.como<{ estado: string; ajustes: Record<string, unknown> }>(ADMIN, `select estado, ajustes from f29_declaraciones where empresa_id=$1 and periodo='2026-02'`, [emp]);
    expect(feb).toEqual({ estado: 'borrador', ajustes: { tasaPPM: 0.2, tasaPPMManual: true } });
    expect(await b.como(ADMIN, `select tasa_ppm::float n from empresas where id=$1`, [emp])).toEqual([{ n: 0.125 }]);
  });

  it('nadie llama a vaciar_anio directamente', async () => {
    await expect(b.como(ADMIN, `select vaciar_anio($1, 2025)`, [emp])).rejects.toThrow(/permission denied|permiso/i);
  });
});
