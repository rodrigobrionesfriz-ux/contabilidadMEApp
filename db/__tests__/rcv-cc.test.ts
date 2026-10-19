import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { baseDePrueba } from './helpers';

const ADMIN = '11111111-1111-1111-1111-111111111111';

describe('centros de costo al registrar documentos', () => {
  let b: Awaited<ReturnType<typeof baseDePrueba>>;
  let emp: string;
  const j = (x: unknown) => JSON.stringify(x);
  const doc = (folio: string, cc: string) => ({
    tipo: 'compra', rut: '12563178-9', tipo_dte: 46, folio, fecha: '2026-06-05', razon_social: 'Proveedor', neto: 1000, exento: 0, iva: 190, total: 1000, ref: `c-${folio}`,
    datos: { dist: [{ cuenta: '3202024', monto: 1000, cc }] },
  });
  const asiento = (cc: string) => ({ fecha: '2026-06-05', glosa: 'Factura de compra', lineas: [
    { cuenta: '3202024', debe: 1000, haber: 0, cc },
    { cuenta: '1108002', debe: 190, haber: 0 },
    { cuenta: '2103005', debe: 0, haber: 190 },
    { cuenta: '2102001', debe: 0, haber: 1000, rut: '12563178-9', tipo_dte: '46', folio: '1' },
  ] });
  const registrar = (folio: string, cc: string) => b.como<{ numero: number }>(ADMIN, `select * from registrar_documento($1, $2, $3)`, [emp, j(doc(folio, cc)), j(asiento(cc))]);

  beforeAll(async () => {
    b = await baseDePrueba();
    await b.db.exec(`insert into auth.users (id, email) values ('${ADMIN}', 'a@t.cl')`);
    emp = (await b.como<{ id: string }>(ADMIN, `select crear_empresa('76151704-K', 'Agrícola SpA') id`))[0].id;
    await b.db.exec(`update cuentas set acepta_centro_costo = true where empresa_id = '${emp}' and codigo = '3202024'`);
    await b.db.exec(`insert into centros_costo (empresa_id, codigo, nombre, nivel, ref_origen) values ('${emp}', 'AGRI', 'AGRICOLA', 1, 'cc_mu188amoxkl')`);
  });

  it('traduce el id del sistema anterior al código vigente', async () => {
    await registrar('2098', 'cc_mu188amoxkl');
    const [l] = await b.como<{ centro_costo: string }>(ADMIN, `select l.centro_costo from asiento_lineas l join asientos a on a.id = l.asiento_id
      where a.empresa_id = $1 and l.cuenta = '3202024'`, [emp]);
    expect(l.centro_costo).toBe('AGRI');
  });

  it('acepta el código directo y sin centro', async () => {
    await registrar('2099', 'AGRI');
    await registrar('2100', '');
  });

  it('un centro inexistente da un mensaje claro, no la violación de clave foránea', async () => {
    await expect(registrar('2101', 'cc_inexistente')).rejects.toThrow(/centro de costo "cc_inexistente" no existe/);
  });

  it('la corrección única reemplaza el id antiguo en los documentos importados', async () => {
    await b.db.exec(`insert into documentos (empresa_id, anio, tipo, ref_origen, tipo_dte, folio, fecha, rut, neto, exento, iva, total, datos)
      values ('${emp}', 2026, 'compra', 'c_imp_1', 33, '179', '2026-05-04', '14513781-0', 532280, 0, 101133, 633413,
      '{"cc":"cc_mu188amoxkl","dist":[{"cuenta":"3202026","monto":532280,"cc":"cc_mu188amoxkl"},{"cuenta":"3202024","monto":1,"cc":"OTRO"}]}')`);
    const sql = fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/20261019000020_rcv_centros_costo.sql'), 'utf8');
    await b.db.exec(sql.slice(sql.indexOf('-- 3.')));
    const [d] = await b.como<{ datos: { cc: string; dist: { cc: string }[] } }>(ADMIN, `select datos from documentos where empresa_id = $1 and ref_origen = 'c_imp_1'`, [emp]);
    expect(d.datos.cc).toBe('AGRI');
    expect(d.datos.dist.map((x) => x.cc)).toEqual(['AGRI', 'OTRO']);
  });
});
