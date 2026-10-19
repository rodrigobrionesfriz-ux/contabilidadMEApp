import { describe, it, expect, beforeAll } from 'vitest';
import { baseDePrueba } from './helpers';

const ADMIN = '11111111-1111-1111-1111-111111111111';
const CONS = '33333333-3333-3333-3333-333333333333';

describe('RCV guardado por período', () => {
  let b: Awaited<ReturnType<typeof baseDePrueba>>;
  let emp: string;
  const j = (x: unknown) => JSON.stringify(x);
  const doc = (folio: string, rut = '12563178', dv = '9') => ({ tipoDTE: 46, numero: folio, rutCodigo: rut, rutDV: dv, fecha: '2026-07-01', total: 1000 });

  beforeAll(async () => {
    b = await baseDePrueba();
    await b.db.exec(`insert into auth.users (id, email) values ('${ADMIN}', 'a@t.cl'), ('${CONS}', 'q@t.cl')`);
    emp = (await b.como<{ id: string }>(ADMIN, `select crear_empresa('76151704-K', 'Agrícola SpA') id`))[0].id;
    await b.como(ADMIN, `select agregar_miembro($1, 'q@t.cl', 'consulta')`, [emp]);
  });

  it('guarda la carga y cuenta los pendientes contra el libro', async () => {
    await b.como(ADMIN, `insert into rcv_cargas (empresa_id, tipo, periodo, archivo, docs) values ($1, 'compra', '2026-07', 'RCV_COMPRA_202607.csv', $2)`,
      [emp, j([doc('2098'), doc('2099'), doc('2100')])]);
    await b.db.exec(`insert into documentos (empresa_id, anio, tipo, tipo_dte, folio, fecha, rut, neto, exento, iva, total) values
      ('${emp}', 2026, 'compra', 46, '2098', '2026-07-01', '12563178-9', 1, 0, 0, 1),
      ('${emp}', 2026, 'compra', 46, '2099', '2026-07-01', '12563178-9', 1, 0, 0, 1)`);
    await b.db.exec(`update documentos set estado = 'anulado' where empresa_id = '${emp}' and folio = '2099'`);
    const r = await b.como<{ periodo: string; archivo: string; total: number; pendientes: number }>(ADMIN, `select periodo, archivo, total, pendientes from rcv_resumen($1, 'compra')`, [emp]);
    expect(r).toEqual([{ periodo: '2026-07', archivo: 'RCV_COMPRA_202607.csv', total: 3, pendientes: 2 }]);
  });

  it('consulta ve las cargas pero no las crea ni borra', async () => {
    expect(await b.como(CONS, `select periodo from rcv_cargas where empresa_id = $1`, [emp])).toHaveLength(1);
    await expect(b.como(CONS, `insert into rcv_cargas (empresa_id, tipo, periodo, archivo) values ($1, 'venta', '2026-07', 'x')`, [emp])).rejects.toThrow();
    await b.como(CONS, `delete from rcv_cargas where empresa_id = $1`, [emp]);
    expect(await b.como(ADMIN, `select periodo from rcv_cargas where empresa_id = $1`, [emp])).toHaveLength(1);
  });
});
