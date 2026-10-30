import { describe, it, expect, beforeAll } from 'vitest';
import { baseDePrueba } from './helpers';

const ADM = '11111111-1111-1111-1111-111111111111';
const SEN = '22222222-2222-2222-2222-222222222222';
const CON = '33333333-3333-3333-3333-333333333333';
const OTRO = '44444444-4444-4444-4444-444444444444';

describe('administrador, perfiles Senior y Contador', () => {
  let b: Awaited<ReturnType<typeof baseDePrueba>>;
  let empSen: string;
  let senior: string, contador: string;
  beforeAll(async () => {
    b = await baseDePrueba();
    await b.db.exec(`update ajustes_sistema set perfil_nuevo = (select id from perfiles_acceso where nombre = 'Contador')`);
    await b.db.exec(`insert into auth.users (id, email) values ('${ADM}', 'adm@t.cl'), ('${SEN}', 'sen@t.cl'), ('${CON}', 'con@t.cl'), ('${OTRO}', 'otro@t.cl')`);
    await b.db.exec(`update perfiles set es_administrador = true where id = '${ADM}'`);
    [{ id: senior }] = await b.como<{ id: string }>(ADM, `select id from perfiles_acceso where nombre = 'Senior'`);
    [{ id: contador }] = await b.como<{ id: string }>(ADM, `select id from perfiles_acceso where nombre = 'Contador'`);
  });

  it('los nuevos usuarios reciben el perfil Contador y no pueden crear empresas', async () => {
    expect(await b.como(CON, `select es_administrador, perfil, tipo from mi_acceso()`)).toEqual([{ es_administrador: false, perfil: 'Contador', tipo: 'contador' }]);
    await expect(b.como(CON, `select crear_empresa('76151704-K', 'X')`)).rejects.toThrow(/no permite crear empresas/);
  });

  it('nadie se da permisos a sí mismo; sólo el administrador asigna perfiles', async () => {
    await expect(b.como(SEN, `update perfiles set es_administrador = true where id = $1`, [SEN])).rejects.toThrow();
    await expect(b.como(SEN, `select asignar_perfil($1, $2, false)`, [SEN, senior])).rejects.toThrow(/Sólo el administrador/);
    await b.como(ADM, `select asignar_perfil($1, $2, false)`, [SEN, senior]);
    await b.como(SEN, `update perfiles set nombre = 'Sergio' where id = $1`, [SEN]);
    expect(await b.como(SEN, `select tipo from mi_acceso()`)).toEqual([{ tipo: 'senior' }]);
  });

  it('el Senior crea su empresa y autoriza a un Contador; el contador ve sólo esa', async () => {
    empSen = (await b.como<{ id: string }>(SEN, `select crear_empresa('76151704-K', 'Agrícola Senior') id`))[0].id;
    await b.como(ADM, `select crear_empresa('77684700-3', 'Empresa del Admin')`);
    await expect(b.como(SEN, `select agregar_miembro($1, 'con@t.cl', 'admin')`, [empSen])).rejects.toThrow(/Sólo el administrador puede agregar otro dueño/);
    await b.como(SEN, `select agregar_miembro($1, 'con@t.cl', 'contador')`, [empSen]);
    expect(await b.como(CON, `select razon_social from empresas order by 1`)).toEqual([{ razon_social: 'Agrícola Senior' }]);
    expect(await b.como(SEN, `select razon_social from empresas order by 1`)).toEqual([{ razon_social: 'Agrícola Senior' }]);
    expect(await b.como(OTRO, `select razon_social from empresas`)).toEqual([]);
    await expect(b.como(SEN, `update miembros set rol = 'admin' where empresa_id = $1 and usuario_id = $2`, [empSen, CON])).rejects.toThrow(/Sólo el administrador puede nombrar/);
  });

  it('el administrador ve y trabaja en todas las empresas', async () => {
    expect(await b.como(ADM, `select razon_social from empresas order by 1`)).toEqual([{ razon_social: 'Agrícola Senior' }, { razon_social: 'Empresa del Admin' }]);
    expect(await b.como(ADM, `select puede_escribir($1) w, es_admin($1) a`, [empSen])).toEqual([{ w: true, a: true }]);
    expect((await b.como(ADM, `select count(*)::int n from cuentas where empresa_id = $1`, [empSen]))[0]).toEqual({ n: 296 });
  });

  it('edición de perfiles: sólo el administrador, con permisos válidos, y siempre queda un administrador', async () => {
    await expect(b.como(SEN, `select guardar_perfil_acceso(null, 'X', 'contador', '{}')`)).rejects.toThrow(/Sólo el administrador/);
    await expect(b.como(ADM, `select guardar_perfil_acceso(null, 'X', 'contador', '{"reportes":"todo"}')`)).rejects.toThrow(/Permiso no válido/);
    const [{ id }] = await b.como<{ id: string }>(ADM, `select guardar_perfil_acceso(null, 'Auditor', 'contador', '{"reportes":"ver","comprobantes":"no"}') id`);
    await b.como(ADM, `select asignar_perfil($1, $2, false)`, [OTRO, id]);
    await expect(b.como(ADM, `select eliminar_perfil_acceso($1)`, [id])).rejects.toThrow(/Hay usuarios con este perfil/);
    await expect(b.como(ADM, `select eliminar_perfil_acceso($1)`, [contador])).rejects.toThrow();
    await expect(b.como(ADM, `select asignar_perfil($1, $2, false)`, [ADM, senior])).rejects.toThrow(/al menos un administrador/);
    expect((await b.como(ADM, `select count(*)::int n from usuarios_sistema()`))[0]).toEqual({ n: 4 });
    expect(await b.como(SEN, `select count(*)::int n from usuarios_sistema()`)).toEqual([{ n: 0 }]);
  });
});
