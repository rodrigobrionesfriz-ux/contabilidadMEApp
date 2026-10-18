import { describe, it, expect, beforeAll } from 'vitest';
import { baseDePrueba } from './helpers';

const ADMIN = '11111111-1111-1111-1111-111111111111';
const CONT = '22222222-2222-2222-2222-222222222222';
const CONSULTA = '33333333-3333-3333-3333-333333333333';

describe('declaraciones F29', () => {
  let b: Awaited<ReturnType<typeof baseDePrueba>>;
  let emp: string;
  beforeAll(async () => {
    b = await baseDePrueba();
    await b.db.exec(`insert into auth.users (id, email) values ('${ADMIN}', 'a@t.cl'), ('${CONT}', 'c@t.cl'), ('${CONSULTA}', 'q@t.cl')`);
    emp = (await b.como<{ id: string }>(ADMIN, `select crear_empresa('76151704-K', 'Agrícola SpA') id`))[0].id;
    await b.como(ADMIN, `select agregar_miembro($1, 'c@t.cl', 'contador')`, [emp]);
    await b.como(ADMIN, `select agregar_miembro($1, 'q@t.cl', 'consulta')`, [emp]);
  });

  it('el contador guarda y presenta; queda bloqueado; sólo el admin reabre', async () => {
    await b.como(CONT, `select guardar_f29($1, '2026-03', '{"89": 1000}', 69889, null)`, [emp]);
    await expect(b.como(CONSULTA, `select guardar_f29($1, '2026-03', '{}', 0, null)`, [emp])).rejects.toThrow(/permiso/);
    await b.como(CONT, `select presentar_f29($1, '2026-03', '{"89": 1200}', '{"89": 1200}')`, [emp]);
    await expect(b.como(CONT, `select guardar_f29($1, '2026-03', '{}', 0, null)`, [emp])).rejects.toThrow(/presentado/);
    await expect(b.como(CONT, `select reabrir_f29($1, '2026-03')`, [emp])).rejects.toThrow(/administrador/);
    await b.como(ADMIN, `select reabrir_f29($1, '2026-03')`, [emp]);
    const [d] = await b.como<{ estado: string; declarado: Record<string, number> }>(CONSULTA, `select estado, declarado from f29_declaraciones where empresa_id=$1`, [emp]);
    expect(d).toEqual({ estado: 'borrador', declarado: { '89': 1200 } });
  });

  it('impuesto único por mes desde asientos de remuneraciones', async () => {
    await b.como(ADMIN, `select * from crear_asiento($1, '2026-02-28', 'Remuneraciones febrero', '[{"cuenta":"3201001","debe":41000},{"cuenta":"2104002","haber":41000}]', 'remuneraciones')`, [emp]);
    await b.como(ADMIN, `select * from crear_asiento($1, '2026-02-28', 'Otro', '[{"cuenta":"3201001","debe":5},{"cuenta":"2104002","haber":5}]', 'manual')`, [emp]);
    const r = await b.como<{ periodo: string; monto: string }>(ADMIN, `select * from iusc_por_periodo($1, 2026)`, [emp]);
    expect(r.map((x) => [x.periodo, Number(x.monto)])).toEqual([['2026-02', 41000]]);
  });

  it('tasa PPM editable por el admin', async () => {
    await b.como(ADMIN, `update empresas set tasa_ppm = 1.25 where id = $1`, [emp]);
    const [e] = await b.como<{ tasa_ppm: string }>(ADMIN, `select tasa_ppm from empresas where id=$1`, [emp]);
    expect(Number(e.tasa_ppm)).toBe(1.25);
  });
});
