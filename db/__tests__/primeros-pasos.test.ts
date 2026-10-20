import { describe, it, expect, beforeAll } from 'vitest';
import { baseDePrueba } from './helpers';

const ADMIN = '11111111-1111-1111-1111-111111111111';
const CONS = '33333333-3333-3333-3333-333333333333';

describe('primeros pasos de la empresa', () => {
  let b: Awaited<ReturnType<typeof baseDePrueba>>;
  let emp: string;
  beforeAll(async () => {
    b = await baseDePrueba();
    await b.db.exec(`insert into auth.users (id, email) values ('${ADMIN}', 'a@t.cl'), ('${CONS}', 'q@t.cl')`);
    emp = (await b.como<{ id: string }>(ADMIN, `select crear_empresa('76151704-K', 'Agrícola SpA') id`))[0].id;
    await b.como(ADMIN, `select agregar_miembro($1, 'q@t.cl', 'consulta')`, [emp]);
  });
  it('marca, omite y desmarca pasos', async () => {
    await b.como(ADMIN, `select marcar_paso($1, 'datos', 'listo')`, [emp]);
    await b.como(ADMIN, `select marcar_paso($1, 'centros', 'omitido')`, [emp]);
    expect((await b.como<{ p: object }>(ADMIN, `select primeros_pasos p from empresas where id = $1`, [emp]))[0].p).toEqual({ datos: 'listo', centros: 'omitido' });
    await b.como(ADMIN, `select marcar_paso($1, 'centros', null)`, [emp]);
    expect((await b.como<{ p: object }>(ADMIN, `select primeros_pasos p from empresas where id = $1`, [emp]))[0].p).toEqual({ datos: 'listo' });
  });
  it('consulta no puede marcar y no acepta estados raros', async () => {
    await expect(b.como(CONS, `select marcar_paso($1, 'plan', 'listo')`, [emp])).rejects.toThrow(/administrador o contador/);
    await expect(b.como(ADMIN, `select marcar_paso($1, 'plan', 'quizas')`, [emp])).rejects.toThrow(/Estado inválido/);
  });
});
