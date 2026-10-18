import { describe, it, expect, beforeAll } from 'vitest';
import { baseDePrueba } from './helpers';

const ADMIN = '11111111-1111-1111-1111-111111111111';
const CONS = '33333333-3333-3333-3333-333333333333';
const AJENO = '44444444-4444-4444-4444-444444444444';

describe('renta anual y declaraciones juradas en la base', () => {
  let b: Awaited<ReturnType<typeof baseDePrueba>>;
  let emp: string;
  beforeAll(async () => {
    b = await baseDePrueba();
    await b.db.exec(`insert into auth.users (id, email) values ('${ADMIN}', 'a@t.cl'), ('${CONS}', 'q@t.cl'), ('${AJENO}', 'z@t.cl')`);
    emp = (await b.como<{ id: string }>(ADMIN, `select crear_empresa('76151704-K', 'Agrícola SpA') id`))[0].id;
    await b.como(ADMIN, `select agregar_miembro($1, 'q@t.cl', 'consulta')`, [emp]);
  });

  it('guarda la declaración de renta; consulta solo lee y un ajeno no ve nada', async () => {
    await b.como(ADMIN, `insert into renta_declaraciones (empresa_id, anio, datos) values ($1, 2026, '{"regimen":"14D3"}')`, [emp]);
    await b.como(ADMIN, `update renta_declaraciones set datos = '{"regimen":"14A"}' where empresa_id = $1 and anio = 2026`, [emp]);
    expect((await b.como<{ r: string }>(CONS, `select datos->>'regimen' r from renta_declaraciones where empresa_id = $1`, [emp]))[0].r).toBe('14A');
    await expect(b.como(CONS, `insert into renta_declaraciones (empresa_id, anio, datos) values ($1, 2025, '{}')`, [emp])).rejects.toThrow();
    expect(await b.como(AJENO, `select * from renta_declaraciones`)).toEqual([]);
  });

  it('el catálogo es un arreglo y los estados un objeto', async () => {
    await b.como(ADMIN, `insert into dj_catalogo (empresa_id, catalogo) values ($1, '[{"n":"1887"}]')`, [emp]);
    await expect(b.como(ADMIN, `update dj_catalogo set catalogo = '{}' where empresa_id = $1`, [emp])).rejects.toThrow();
    await b.como(ADMIN, `insert into dj_estados (empresa_id, anio_tributario, estados) values ($1, 2027, '{"1887":{"estado":"presentada"}}')`, [emp]);
    await expect(b.como(ADMIN, `insert into dj_estados (empresa_id, anio_tributario, estados) values ($1, 2028, '[]')`, [emp])).rejects.toThrow();
    await expect(b.como(CONS, `update dj_estados set estados = '{}' where empresa_id = $1 returning 1`, [emp])).resolves.toEqual([]);
  });
});
