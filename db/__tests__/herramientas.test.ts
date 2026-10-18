import { describe, it, expect, beforeAll } from 'vitest';
import { baseDePrueba } from './helpers';

const ADMIN = '11111111-1111-1111-1111-111111111111';
const CONT = '22222222-2222-2222-2222-222222222222';
const CONS = '33333333-3333-3333-3333-333333333333';

describe('herramientas en la base', () => {
  let b: Awaited<ReturnType<typeof baseDePrueba>>;
  let emp: string;
  const j = (x: unknown) => JSON.stringify(x);
  beforeAll(async () => {
    b = await baseDePrueba();
    await b.db.exec(`insert into auth.users (id, email) values ('${ADMIN}', 'a@t.cl'), ('${CONT}', 'c@t.cl'), ('${CONS}', 'q@t.cl')`);
    emp = (await b.como<{ id: string }>(ADMIN, `select crear_empresa('76151704-K', 'Agrícola SpA') id`))[0].id;
    await b.como(ADMIN, `select agregar_miembro($1, 'c@t.cl', 'contador')`, [emp]);
    await b.como(ADMIN, `select agregar_miembro($1, 'q@t.cl', 'consulta')`, [emp]);
    await b.como(ADMIN, `insert into centros_costo (empresa_id, codigo, nombre) values ($1, 'P1', 'Predio 1'), ($1, 'P2', 'Predio 2')`, [emp]);
    await b.como(ADMIN, `update cuentas set acepta_centro_costo = true where empresa_id = $1 and codigo = '3202001'`, [emp]);
  });

  it('asigna centros de costo sólo a líneas de gasto que lo admiten', async () => {
    await b.como(ADMIN, `select * from crear_asiento($1, '2026-03-10', 'Asesoría', $2)`, [emp, j([{ cuenta: '3202001', debe: 1000, haber: 0 }, { cuenta: '1101201', debe: 0, haber: 1000 }])]);
    const ls = await b.como<{ id: number; cuenta: string }>(ADMIN, `select id, cuenta from lineas_costeables($1, '2026-01-01', '2026-12-31')`, [emp]);
    expect(ls.map((l) => l.cuenta)).toEqual(['3202001']);
    const banco = (await b.como<{ id: number }>(ADMIN, `select id from asiento_lineas where empresa_id = $1 and cuenta = '1101201'`, [emp]))[0].id;
    await expect(b.como(CONT, `select asignar_centro_costo($1, $2, 'P1')`, [emp, [banco]])).rejects.toThrow(/no se pueden asignar/);
    await expect(b.como(CONS, `select asignar_centro_costo($1, $2, 'P1')`, [emp, [ls[0].id]])).rejects.toThrow(/permiso/);
    await expect(b.como(CONT, `select asignar_centro_costo($1, $2, 'ZZ')`, [emp, [ls[0].id]])).rejects.toThrow(/no existe/);
    expect((await b.como<{ n: number }>(CONT, `select asignar_centro_costo($1, $2, 'P2') n`, [emp, [ls[0].id]]))[0].n).toBe(1);
    expect((await b.como<{ centro_costo: string }>(ADMIN, `select centro_costo from asiento_lineas where id = $1`, [ls[0].id]))[0].centro_costo).toBe('P2');
  });

  it('reserva folios consecutivos sin repetir y registra la actividad', async () => {
    await b.como(ADMIN, `select agregar_rango_folios($1, 100, 105, '2026-01-02')`, [emp]);
    await expect(b.como(ADMIN, `select agregar_rango_folios($1, 104, 110, null)`, [emp])).rejects.toThrow(/superpone/);
    const r1 = await b.como<{ f: number[] }>(CONT, `select reservar_folios($1, 2, 'diario', '2026-01-01', '2026-01-31', '{}', '[[],[]]', 'c@t.cl') f`, [emp]);
    expect(r1[0].f).toEqual([100, 101]);
    const r2 = await b.como<{ f: number[] }>(CONT, `select reservar_folios($1, 3, 'mayor', '2026-01-01', '2026-01-31', '{}', '[[],[],[]]', 'c@t.cl') f`, [emp]);
    expect(r2[0].f).toEqual([102, 103, 104]);
    await expect(b.como(CONT, `select reservar_folios($1, 2, 'mayor', '2026-01-01', '2026-01-31', '{}', '[[],[]]', '')`, [emp])).rejects.toThrow(/No quedan 2/);
    const id = (await b.como<{ id: string }>(ADMIN, `select id from folios_reservas where libro = 'diario'`))[0].id;
    await b.como(CONT, `select cerrar_reserva_folios($1, $2, 'inutilizado', 'c@t.cl')`, [emp, id]);
    await expect(b.como(CONT, `select cerrar_reserva_folios($1, $2, 'usado', '')`, [emp, id])).rejects.toThrow(/ya fue cerrada/);
    await b.como(CONT, `select registrar_actividad($1, 'guardar_renta', '{"anio":2026}')`, [emp]);
    await expect(b.como(CONT, `select registrar_actividad($1, 'DROP TABLE', '{}')`, [emp])).rejects.toThrow(/inválida/);
    const act = await b.como<{ accion: string; usuario: string }>(ADMIN, `select accion, usuario from actividad_empresa($1, 50)`, [emp]);
    expect(act.slice(0, 3).map((a) => a.accion)).toEqual(['guardar_renta', 'folios_inutilizado', 'folios_reserva']);
    expect(await b.como(CONT, `select * from actividad_empresa($1, 50)`, [emp])).toEqual([]);
  });

  it('busca en documentos, asientos, cuentas y más con todas las palabras', async () => {
    const r = await b.como<{ tipo: string; titulo: string }>(CONS, `select tipo, titulo from buscar_global($1, 'asesoria')`, [emp]);
    expect(r.some((x) => x.tipo === 'asiento' && x.titulo.includes('Asesoría'))).toBe(true);
    expect(r.some((x) => x.tipo === 'cuenta' && x.titulo.startsWith('3202001'))).toBe(true);
    expect((await b.como(CONS, `select * from buscar_global($1, 'asesoria banco')`, [emp]))).toEqual([]);
    expect((await b.como(CONS, `select * from buscar_global($1, 'a')`, [emp]))).toEqual([]);
  });
});
