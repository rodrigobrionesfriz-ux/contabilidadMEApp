import { describe, it, expect, beforeAll } from 'vitest';
import { baseDePrueba } from './helpers';

const ADMIN = '11111111-1111-1111-1111-111111111111';
const CONS = '33333333-3333-3333-3333-333333333333';

describe('activo fijo y conciliación en la base', () => {
  let b: Awaited<ReturnType<typeof baseDePrueba>>;
  let emp: string, otra: string;
  const j = (x: unknown) => JSON.stringify(x);
  beforeAll(async () => {
    b = await baseDePrueba();
    await b.db.exec(`insert into auth.users (id, email) values ('${ADMIN}', 'a@t.cl'), ('${CONS}', 'q@t.cl')`);
    emp = (await b.como<{ id: string }>(ADMIN, `select crear_empresa('76151704-K', 'Agrícola SpA') id`))[0].id;
    otra = (await b.como<{ id: string }>(ADMIN, `select crear_empresa('96572800-7', 'Otra SpA') id`))[0].id;
    await b.como(ADMIN, `select agregar_miembro($1, 'q@t.cl', 'consulta')`, [emp]);
  });

  it('el activo usa cuentas del plan y sólo hay una depreciación vigente por año', async () => {
    await b.como(ADMIN, `insert into activos_fijos (empresa_id, descripcion, categoria, fecha, cuenta_activo, cuenta_depr_acum, cuenta_gasto, ficha) values ($1, 'Tractor', 'maquinarias', '2026-03-01', '1201003', '1201203', '3301003', '{}')`, [emp]);
    await expect(b.como(ADMIN, `insert into activos_fijos (empresa_id, descripcion, categoria, fecha, cuenta_activo, cuenta_depr_acum, cuenta_gasto, ficha) values ($1, 'X', 'maquinarias', '2026-03-01', '9999999', '1201203', '3301003', '{}')`, [emp])).rejects.toThrow();
    await expect(b.como(CONS, `insert into activos_fijos (empresa_id, descripcion, categoria, fecha, cuenta_activo, cuenta_depr_acum, cuenta_gasto, ficha) values ($1, 'X', 'maquinarias', '2026-03-01', '1201003', '1201203', '3301003', '{}')`, [emp])).rejects.toThrow();
    const lineas = [{ cuenta: '3301003', debe: 1000, haber: 0 }, { cuenta: '1201203', debe: 0, haber: 1000 }];
    await b.como(ADMIN, `select * from crear_asiento($1, '2026-12-31', 'Depreciación', $2, 'depreciacion', 'dep:2026')`, [emp, j(lineas)]);
    await expect(b.como(ADMIN, `select * from crear_asiento($1, '2026-12-31', 'Depreciación', $2, 'depreciacion', 'dep:2026')`, [emp, j(lineas)])).rejects.toThrow();
  });

  it('se marcan líneas del banco de la propia empresa y se guarda el saldo según banco', async () => {
    await b.como(ADMIN, `select * from crear_asiento($1, '2026-04-02', 'Depósito', $2)`, [emp, j([{ cuenta: '1101201', debe: 50000, haber: 0 }, { cuenta: '2301001', debe: 0, haber: 50000 }])]);
    const movs = await b.como<{ id: number; debe: string }>(ADMIN, `select * from lineas_cuentas($1, '1101', '2026-01-01', '2026-12-31')`, [emp]);
    expect(movs).toHaveLength(1);
    await b.como(ADMIN, `insert into conciliacion_marcas (empresa_id, linea_id) values ($1, $2)`, [emp, movs[0].id]);
    await expect(b.como(ADMIN, `insert into conciliacion_marcas (empresa_id, linea_id) values ($1, $2)`, [otra, movs[0].id])).rejects.toThrow();
    await b.como(ADMIN, `insert into conciliacion_saldos (empresa_id, cuenta, anio, saldo_banco) values ($1, '1101201', 2026, 50000)`, [emp]);
    await expect(b.como(CONS, `delete from conciliacion_marcas where linea_id = $1 returning linea_id`, [movs[0].id])).resolves.toEqual([]);
  });
});
