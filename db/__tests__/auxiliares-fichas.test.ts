import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { baseDePrueba } from './helpers';

const ADMIN = '11111111-1111-1111-1111-111111111111';
const CONS = '33333333-3333-3333-3333-333333333333';

describe('fichas de proveedores y clientes', () => {
  let b: Awaited<ReturnType<typeof baseDePrueba>>;
  let emp: string;
  const ficha = (rut: string) => b.como<{ tipo: string; rut: string; razon_social: string; cuenta: string | null; centro_costo: string | null; forma_pago: string | null }>(ADMIN,
    `select tipo, rut, razon_social, cuenta, centro_costo, forma_pago from auxiliares where empresa_id = $1 and rut = $2`, [emp, rut]);

  beforeAll(async () => {
    b = await baseDePrueba();
    await b.db.exec(`insert into auth.users (id, email) values ('${ADMIN}', 'a@t.cl'), ('${CONS}', 'q@t.cl')`);
    emp = (await b.como<{ id: string }>(ADMIN, `select crear_empresa('76151704-K', 'Agrícola SpA') id`))[0].id;
    await b.como(ADMIN, `select agregar_miembro($1, 'q@t.cl', 'consulta')`, [emp]);
    await b.db.exec(`update cuentas set acepta_centro_costo = true where empresa_id = '${emp}' and codigo = '3103001'`);
    await b.db.exec(`insert into centros_costo (empresa_id, codigo, nombre, nivel, ref_origen) values ('${emp}', 'AGRI', 'AGRICOLA', 1, 'cc_mu188amoxkl')`);
  });

  it('el poblado inicial toma la cuenta y el centro del documento más reciente, traduciendo el id antiguo', async () => {
    await b.db.exec(`insert into documentos (empresa_id, anio, tipo, tipo_dte, folio, fecha, rut, razon_social, neto, exento, iva, total, datos) values
      ('${emp}', 2026, 'compra', 46, '2090', '2026-05-01', '12563178-9', 'JUAN ELIAS VALENCIA HERRERA', 1, 0, 0, 1, '{"dist":[{"cuenta":"3202024","cc":""}]}'),
      ('${emp}', 2026, 'compra', 46, '2098', '2026-06-05', '12563178-9', 'JUAN ELIAS VALENCIA HERRERA', 1, 0, 0, 1, '{"dist":[{"cuenta":"3103001","cc":"cc_mu188amoxkl"}]}'),
      ('${emp}', 2026, 'venta', 33, '3125', '2026-01-12', '96547890-6', 'ASERRADEROS JCE S A', 1, 0, 0, 1, '{"cuentaIngreso":"4101001","formaPago":"clientes"}')`);
    const sql = fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/20261019000019_fichas_auxiliares.sql'), 'utf8');
    await b.db.exec(sql.slice(sql.indexOf('-- Poblado inicial')));
    expect(await ficha('12563178-9')).toEqual([{ tipo: 'proveedor', rut: '12563178-9', razon_social: 'JUAN ELIAS VALENCIA HERRERA', cuenta: '3103001', centro_costo: 'AGRI', forma_pago: null }]);
    expect((await ficha('96547890-6'))[0]).toMatchObject({ tipo: 'cliente', cuenta: '4101001', forma_pago: 'clientes' });
  });

  it('crea la ficha de un proveedor nuevo y no la pisa si ya existe (sólo crear)', async () => {
    const [n] = await b.como<{ guardar_auxiliar: boolean }>(ADMIN, `select guardar_auxiliar($1, 'proveedor', '14.513.781-0', 'JOSE PULGAR', '3202026', '', null, null, null, null, null, true, true)`, [emp]);
    expect(n.guardar_auxiliar).toBe(true);
    expect((await ficha('14513781-0'))[0]).toMatchObject({ razon_social: 'JOSE PULGAR', cuenta: '3202026', centro_costo: null });
    const [m] = await b.como<{ guardar_auxiliar: boolean }>(ADMIN, `select guardar_auxiliar($1, 'proveedor', '14513781-0', 'OTRO', '3202024', '', null, null, null, null, null, true, true)`, [emp]);
    expect(m.guardar_auxiliar).toBe(false);
    expect((await ficha('14513781-0'))[0].cuenta).toBe('3202026');
  });

  it('actualiza la ficha y valida permisos, RUT, cuenta y centro', async () => {
    await b.como(ADMIN, `select guardar_auxiliar($1, 'proveedor', '14513781-0', 'JOSE DAGOBERTO PULGAR FUENTES', '3103001', 'cc_mu188amoxkl')`, [emp]);
    expect((await ficha('14513781-0'))[0]).toMatchObject({ razon_social: 'JOSE DAGOBERTO PULGAR FUENTES', cuenta: '3103001', centro_costo: 'AGRI' });
    await expect(b.como(CONS, `select guardar_auxiliar($1, 'proveedor', '14513781-0', 'X')`, [emp])).rejects.toThrow(/permiso/);
    await expect(b.como(ADMIN, `select guardar_auxiliar($1, 'proveedor', '14513781-1', 'X')`, [emp])).rejects.toThrow(/RUT/);
    await expect(b.como(ADMIN, `select guardar_auxiliar($1, 'proveedor', '14513781-0', 'X', '9999999')`, [emp])).rejects.toThrow(/no existe/);
    await expect(b.como(ADMIN, `select guardar_auxiliar($1, 'proveedor', '14513781-0', 'X', '3103', '')`, [emp])).rejects.toThrow(/agrupadora/);
    await expect(b.como(ADMIN, `select guardar_auxiliar($1, 'proveedor', '14513781-0', 'X', '3103001', 'NOEXISTE')`, [emp])).rejects.toThrow(/no existe/);
  });

  it('los de consulta ven las fichas pero no escriben directo en la tabla', async () => {
    const v = await b.como(CONS, `select rut from auxiliares where empresa_id = $1`, [emp]);
    expect(v.length).toBeGreaterThan(0);
    await expect(b.como(ADMIN, `insert into auxiliares (empresa_id, tipo, rut, razon_social) values ($1, 'proveedor', '11111111-1', 'X')`, [emp])).rejects.toThrow();
  });
});
