import { describe, it, expect, beforeAll } from 'vitest';
import { baseDePrueba } from './helpers';

const ADMIN = '11111111-1111-1111-1111-111111111111';
const CONT = '22222222-2222-2222-2222-222222222222';
const CONS = '33333333-3333-3333-3333-333333333333';

describe('contratos en la base', () => {
  let b: Awaited<ReturnType<typeof baseDePrueba>>;
  let emp: string, otra: string, trab: string, ajeno: string;
  beforeAll(async () => {
    b = await baseDePrueba();
    await b.db.exec(`insert into auth.users (id, email) values ('${ADMIN}', 'a@t.cl'), ('${CONT}', 'c@t.cl'), ('${CONS}', 'q@t.cl')`);
    emp = (await b.como<{ id: string }>(ADMIN, `select crear_empresa('76151704-K', 'Agrícola SpA') id`))[0].id;
    otra = (await b.como<{ id: string }>(ADMIN, `select crear_empresa('96572800-7', 'Otra SpA') id`))[0].id;
    await b.como(ADMIN, `select agregar_miembro($1, 'c@t.cl', 'contador')`, [emp]);
    await b.como(ADMIN, `select agregar_miembro($1, 'q@t.cl', 'consulta')`, [emp]);
    [{ id: trab }] = await b.como<{ id: string }>(ADMIN, `insert into trabajadores (empresa_id, rut, nombre) values ($1, '15488555-2', 'Ana') returning id`, [emp]);
    [{ id: ajeno }] = await b.como<{ id: string }>(ADMIN, `insert into trabajadores (empresa_id, rut, nombre) values ($1, '15488555-2', 'Ana otra') returning id`, [otra]);
  });

  it('el contador crea plantillas por cargo, valores por defecto y el contrato del trabajador', async () => {
    await b.como(CONT, `insert into contrato_plantillas (empresa_id, codigo, nombre, cargos, tipo_contrato, texto) values ($1, 'propia-1', 'Motosierrista', 'Motosierrista', 1, 'Texto {{trabajador}}')`, [emp]);
    await b.como(CONT, `insert into contrato_config (empresa_id, defaults) values ($1, '{"duracion": 42}')`, [emp]);
    await b.como(CONT, `insert into contratos_trabajo (empresa_id, trabajador_id, plantilla) values ($1, $2, 'propia-1')`, [emp, trab]);
    const [{ n }] = await b.como<{ n: number }>(CONS, `select count(*)::int n from contrato_plantillas where empresa_id = $1`, [emp]);
    expect(n).toBe(1);
  });

  it('la plantilla repetida, el usuario de consulta y un trabajador de otra empresa se rechazan', async () => {
    await expect(b.como(CONT, `insert into contrato_plantillas (empresa_id, codigo, nombre, texto) values ($1, 'propia-1', 'Otra', 'T')`, [emp])).rejects.toThrow();
    await expect(b.como(CONS, `insert into contrato_plantillas (empresa_id, codigo, nombre, texto) values ($1, 'x', 'X', 'T')`, [emp])).rejects.toThrow();
    await expect(b.como(CONT, `insert into contratos_trabajo (empresa_id, trabajador_id) values ($1, $2)`, [emp, ajeno])).rejects.toThrow();
    await expect(b.como(CONT, `insert into contrato_plantillas (empresa_id, codigo, nombre, texto) values ($1, 'y', 'Y', 'T')`, [otra])).rejects.toThrow();
  });
});
