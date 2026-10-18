import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { baseDePrueba } from './helpers';
import { leerRespaldo } from '@/importador/leer-excel';
import { construirPlanCarga, enLotes } from '@/importador/respaldo';
import pdc from '@/motor/__fixtures__/pdc-base.json';

const ADMIN = '11111111-1111-1111-1111-111111111111';
const CONT = '22222222-2222-2222-2222-222222222222';
const plan = construirPlanCarga(
  leerRespaldo(fs.readFileSync(path.resolve(__dirname, '../../src/importador/__fixtures__/respaldo-2026.xlsx'))),
  pdc,
);

describe('importación del respaldo', () => {
  let b: Awaited<ReturnType<typeof baseDePrueba>>;
  let emp: string;
  const j = (x: unknown) => JSON.stringify(x);

  async function importar(uid = ADMIN) {
    const [{ id }] = await b.como<{ id: string }>(uid, `select importar_iniciar($1, $2, 'respaldo.xlsx', $3, $4) id`,
      [emp, plan.anio, j(plan.cuentas), j(plan.centros)]);
    for (const lote of enLotes(plan.asientos, 4)) await b.como(uid, `select importar_asientos($1, $2)`, [id, j(lote)]);
    for (const lote of enLotes(plan.documentos, 5)) await b.como(uid, `select importar_documentos($1, $2)`, [id, j(lote)]);
    await b.como(uid, `select importar_finalizar($1, $2, $3)`, [id, j(plan.cierres), j(plan.resumen)]);
  }

  beforeAll(async () => {
    b = await baseDePrueba();
    await b.db.exec(`insert into auth.users (id, email) values ('${ADMIN}', 'admin@test.cl'), ('${CONT}', 'cont@test.cl')`);
    emp = (await b.como<{ id: string }>(ADMIN, `select crear_empresa('76151704-K', 'Agrícola Prueba SpA') id`))[0].id;
    await b.como(ADMIN, `select agregar_miembro($1, 'cont@test.cl', 'contador')`, [emp]);
  });

  it('sólo un administrador puede importar', async () => {
    await expect(b.como(CONT, `select importar_iniciar($1, 2026, 'x', '[]', '[]')`, [emp])).rejects.toThrow(/administrador/);
  });

  it('carga el año completo y el balance cuadra con el respaldo', async () => {
    await importar();
    const filas = await b.como<{ cuenta: string; debe: string; haber: string }>(ADMIN,
      `select cuenta, debe, haber from balance_comprobacion($1, '2026-01-01', '2026-12-31')`, [emp]);
    const enBase = Object.fromEntries(filas.map((f) => [f.cuenta, { debe: Number(f.debe), haber: Number(f.haber) }]));
    expect(enBase).toEqual(plan.totales);
    const [{ n }] = await b.como<{ n: number }>(ADMIN, `select count(*)::int n from asientos where empresa_id=$1`, [emp]);
    expect(n).toBe(plan.asientos.length);
  });

  it('conserva números, anulados, centros de costo, RUT y documentos enlazados', async () => {
    const a3 = await b.como(ADMIN, `select numero, anulado from asientos where empresa_id=$1 and ref_origen='a3'`, [emp]);
    expect(a3).toEqual([{ numero: 3, anulado: true }]);
    const cc = await b.como(ADMIN, `select codigo, nivel, padre from centros_costo where empresa_id=$1 order by ref_origen`, [emp]);
    expect(cc).toEqual([
      { codigo: 'FES', nivel: 1, padre: null },
      { codigo: 'FES-1', nivel: 2, padre: 'FES' },
      { codigo: 'ADM', nivel: 1, padre: null },
    ]);
    const lin = await b.como(ADMIN, `select l.centro_costo, l.rut_auxiliar from asiento_lineas l join asientos a on a.id=l.asiento_id
      where a.empresa_id=$1 and a.ref_origen='auto:compras:c1' order by l.orden`, [emp]);
    expect(lin.map((x) => x.centro_costo)).toEqual(['FES-1', 'ADM', null, null]);
    expect(lin[3].rut_auxiliar).toBe('76151704-K');
    const doc = await b.como(ADMIN, `select d.folio, a.ref_origen from documentos d left join asientos a on a.id=d.asiento_id
      where d.empresa_id=$1 and d.ref_origen in ('c6','c5') order by d.ref_origen`, [emp]);
    expect(doc).toEqual([{ folio: '301', ref_origen: null }, { folio: '302', ref_origen: 'a5' }]);
    const cierres = await b.como(ADMIN, `select periodo from periodos_cerrados where empresa_id=$1`, [emp]);
    expect(cierres).toEqual([{ periodo: '2026-01' }]);
  });

  it('el siguiente asiento continúa el correlativo importado', async () => {
    const max = Math.max(...plan.asientos.map((a) => a.numero));
    const [r] = await b.como<{ numero: number }>(ADMIN, `select * from crear_asiento($1, '2026-04-01', 'Nuevo', $2)`,
      [emp, j([{ cuenta: '1101201', debe: 10 }, { cuenta: '2301001', haber: 10 }])]);
    expect(r.numero).toBe(max + 1);
  });

  it('no permite reimportar un año con datos ni borrar si hay asientos propios', async () => {
    await expect(importar()).rejects.toThrow(/ya tiene asientos/);
    await expect(b.como(ADMIN, `select eliminar_importacion($1, 2026)`, [emp])).rejects.toThrow(/registrados en el sistema nuevo/);
  });

  it('eliminar la importación deja el año limpio para rehacerla', async () => {
    await b.db.exec(`delete from asientos where not importado`); // simula que no hay asientos propios
    await b.como(ADMIN, `select eliminar_importacion($1, 2026)`, [emp]);
    const [{ n }] = await b.como<{ n: number }>(ADMIN, `select count(*)::int n from documentos where empresa_id=$1`, [emp]);
    expect(n).toBe(0);
    await importar();
    const [{ m }] = await b.como<{ m: number }>(ADMIN, `select count(*)::int m from asientos where empresa_id=$1`, [emp]);
    expect(m).toBe(plan.asientos.length);
  });

  it('las columnas protegidas no se pueden editar', async () => {
    await expect(b.como(ADMIN, `update empresas set rut='77684700-3' where id=$1`, [emp])).rejects.toThrow(/permission denied/);
    await b.como(ADMIN, `update empresas set giro='Frutícola' where id=$1`, [emp]);
    await expect(b.como(CONT, `update miembros set rol='admin' where usuario_id=$1`, [CONT])).resolves.toBeDefined();
    const [{ rol }] = await b.como<{ rol: string }>(ADMIN, `select rol from miembros where usuario_id=$1`, [CONT]);
    expect(rol).toBe('contador'); // RLS: un contador no puede cambiar roles (0 filas afectadas)
  });
});
