import { describe, it, expect, beforeAll } from 'vitest';
import { baseDePrueba } from './helpers';

const ADMIN = '11111111-1111-1111-1111-111111111111';
const CONS = '33333333-3333-3333-3333-333333333333';

describe('finiquitos en la base', () => {
  let b: Awaited<ReturnType<typeof baseDePrueba>>;
  let emp: string, trab: string, fin: string;
  const j = (x: unknown) => JSON.stringify(x);
  const lineas = [
    { cuenta: '3201011', debe: 300000, haber: 0, glosa: 'Feriado' },
    { cuenta: '2104005', debe: 0, haber: 300000, glosa: 'Finiquito por pagar' },
  ];
  beforeAll(async () => {
    b = await baseDePrueba();
    await b.db.exec(`insert into auth.users (id, email) values ('${ADMIN}', 'a@t.cl'), ('${CONS}', 'c@t.cl')`);
    emp = (await b.como<{ id: string }>(ADMIN, `select crear_empresa('76151704-K', 'Agrícola SpA') id`))[0].id;
    await b.como(ADMIN, `select agregar_miembro($1, 'c@t.cl', 'consulta')`, [emp]);
    [{ id: trab }] = await b.como<{ id: string }>(ADMIN, `insert into trabajadores (empresa_id, rut, nombre) values ($1, '15488555-2', 'Ana') returning id`, [emp]);
  });

  it('se guarda, se contabiliza una sola vez y queda bloqueado', async () => {
    [{ id: fin }] = await b.como<{ id: string }>(ADMIN, `insert into finiquitos (empresa_id, trabajador_id, fecha_termino, causal, datos, calc, total) values ($1, $2, '2026-03-31', '159-2', '{}', '{}', 300000) returning id`, [emp, trab]);
    const [r] = await b.como<{ numero: number }>(ADMIN, `select * from contabilizar_finiquito($1, '2026-03-31', 'Finiquito Ana', $2)`, [fin, j(lineas)]);
    expect(r.numero).toBeGreaterThan(0);
    await expect(b.como(ADMIN, `select * from contabilizar_finiquito($1, '2026-03-31', 'Otra vez', $2)`, [fin, j(lineas)])).rejects.toThrow(/ya está contabilizado/);
    await expect(b.como(ADMIN, `update finiquitos set total = 1 where id = $1`, [fin])).rejects.toThrow(/anula primero/);
    await b.como(ADMIN, `update finiquitos set estado = 'ratificado', ratificado_en = now() where id = $1`, [fin]);
    await b.como(ADMIN, `delete from finiquitos where id = $1`, [fin]);
    const [{ n }] = await b.como<{ n: number }>(ADMIN, `select count(*)::int n from finiquitos where id = $1`, [fin]);
    expect(n).toBe(1); // contabilizado: no se borra
  });

  it('al anular el asiento se puede editar, recontabilizar y borrar', async () => {
    const [{ asiento_id }] = await b.como<{ asiento_id: string }>(ADMIN, `select asiento_id from finiquitos where id = $1`, [fin]);
    await b.como(ADMIN, `select anular_asiento($1, 'Rehacer')`, [asiento_id]);
    await b.como(ADMIN, `update finiquitos set total = 300000, datos = '{"a":1}' where id = $1`, [fin]);
    await b.como(ADMIN, `select * from contabilizar_finiquito($1, '2026-03-31', 'Finiquito Ana', $2)`, [fin, j(lineas)]);
    const [{ a2 }] = await b.como<{ a2: string }>(ADMIN, `select asiento_id a2 from finiquitos where id = $1`, [fin]);
    await b.como(ADMIN, `select anular_asiento($1, 'Rehacer')`, [a2]);
    await b.como(ADMIN, `delete from finiquitos where id = $1`, [fin]);
    const [{ n }] = await b.como<{ n: number }>(ADMIN, `select count(*)::int n from finiquitos where id = $1`, [fin]);
    expect(n).toBe(0);
  });

  it('un usuario de consulta no crea finiquitos ni plantillas, y nadie fija el asiento a mano', async () => {
    await expect(b.como(CONS, `insert into finiquitos (empresa_id, trabajador_id, fecha_termino, causal, datos, calc, total) values ($1, $2, '2026-03-31', '159-2', '{}', '{}', 1)`, [emp, trab])).rejects.toThrow();
    await expect(b.como(CONS, `insert into finiquito_plantillas (empresa_id, codigo, nombre, texto) values ($1, 'x', 'X', 'T')`, [emp])).rejects.toThrow();
    await b.como(ADMIN, `insert into finiquito_plantillas (empresa_id, codigo, nombre, texto) values ($1, 'renuncia', 'Renuncia editada', 'Texto')`, [emp]);
    const [{ id }] = await b.como<{ id: string }>(ADMIN, `insert into finiquitos (empresa_id, trabajador_id, fecha_termino, causal, datos, calc, total) values ($1, $2, '2026-03-31', '159-2', '{}', '{}', 1) returning id`, [emp, trab]);
    await expect(b.como(ADMIN, `update finiquitos set asiento_id = null where id = $1`, [id])).rejects.toThrow();
  });

  it('feriados y configuración Previred en los parámetros', async () => {
    await b.como(ADMIN, `insert into empresa_parametros (empresa_id, feriados, previred) values ($1, $2, $3)`, [emp, j({ extra: [{ fecha: '2026-11-03', nombre: 'Elecciones' }], quitar: [] }), j({ sucursalMutual: '12' })]);
    const [p] = await b.como<{ feriados: { extra: unknown[] } }>(CONS, `select feriados from empresa_parametros where empresa_id = $1`, [emp]);
    expect(p.feriados.extra).toHaveLength(1);
  });
});
