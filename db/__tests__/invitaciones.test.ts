import { describe, it, expect, beforeAll } from 'vitest';
import { baseDePrueba } from './helpers';

const ADM = '11111111-1111-1111-1111-111111111111';
const SEN = '22222222-2222-2222-2222-222222222222';
const CON = '33333333-3333-3333-3333-333333333333';

describe('invitaciones de usuarios nuevos', () => {
  let b: Awaited<ReturnType<typeof baseDePrueba>>;
  let senior: string, emp: string;
  beforeAll(async () => {
    b = await baseDePrueba();
    await b.db.exec(`update ajustes_sistema set perfil_nuevo = (select id from perfiles_acceso where nombre = 'Contador')`);
    await b.db.exec(`insert into auth.users (id, email) values ('${ADM}', 'adm@t.cl')`);
    await b.db.exec(`update perfiles set es_administrador = true where id = '${ADM}'`);
    [{ id: senior }] = await b.como<{ id: string }>(ADM, `select id from perfiles_acceso where nombre = 'Senior'`);
  });

  it('el administrador agrega un Senior sin empresa; al crear su cuenta recibe el perfil y puede crear empresas', async () => {
    expect(await b.como(ADM, `select invitar_usuario(' Sen@T.cl ', $1) r`, [senior])).toEqual([{ r: 'invitado' }]);
    await expect(b.como(SEN, `select invitar_usuario('x@t.cl', $1)`, [senior])).rejects.toThrow(/Sólo el administrador/);
    await b.db.exec(`insert into auth.users (id, email) values ('${SEN}', 'sen@t.cl')`);
    expect(await b.como(SEN, `select tipo from mi_acceso()`)).toEqual([{ tipo: 'senior' }]);
    emp = (await b.como<{ id: string }>(SEN, `select crear_empresa('76151704-K', 'Agrícola Senior') id`))[0].id;
    expect(await b.como(ADM, `select count(*)::int n from invitaciones`)).toEqual([{ n: 0 }]);
  });

  it('el Senior autoriza a un contador sin cuenta: queda invitado y entra a la empresa al registrarse', async () => {
    expect(await b.como(SEN, `select agregar_miembro($1, 'con@t.cl', 'contador') r`, [emp])).toEqual([{ r: null }]);
    expect(await b.como(SEN, `select email, rol from invitaciones`)).toEqual([{ email: 'con@t.cl', rol: 'contador' }]);
    await b.db.exec(`insert into auth.users (id, email) values ('${CON}', 'con@t.cl')`);
    expect(await b.como(CON, `select tipo from mi_acceso()`)).toEqual([{ tipo: 'contador' }]);
    expect(await b.como(CON, `select razon_social from empresas`)).toEqual([{ razon_social: 'Agrícola Senior' }]);
  });

  it('a un usuario existente el administrador le cambia el perfil de inmediato', async () => {
    expect(await b.como(ADM, `select invitar_usuario('con@t.cl', $1) r`, [senior])).toEqual([{ r: 'existente' }]);
    expect(await b.como(CON, `select tipo from mi_acceso()`)).toEqual([{ tipo: 'senior' }]);
  });
});
