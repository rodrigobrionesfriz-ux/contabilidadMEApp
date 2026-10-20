import { describe, it, expect, beforeAll } from 'vitest';
import { baseDePrueba } from './helpers';
import { liquidacionMes, type Trabajador, type ContextoRem } from '@/remuneraciones/calculo';
import { parametrosVigentes } from '@/remuneraciones/parametros';
import { lineaLibro, totalizar, asientoRemuneraciones } from '@/remuneraciones/libro';

const ADMIN = '11111111-1111-1111-1111-111111111111';
const CONT = '22222222-2222-2222-2222-222222222222';

describe('remuneraciones en la base', () => {
  let b: Awaited<ReturnType<typeof baseDePrueba>>;
  let emp: string;
  let trab: string;
  const j = (x: unknown) => JSON.stringify(x);
  beforeAll(async () => {
    b = await baseDePrueba();
    await b.db.exec(`insert into auth.users (id, email) values ('${ADMIN}', 'a@t.cl'), ('${CONT}', 'c@t.cl')`);
    emp = (await b.como<{ id: string }>(ADMIN, `select crear_empresa('76151704-K', 'Agrícola SpA') id`))[0].id;
    await b.como(ADMIN, `select agregar_miembro($1, 'c@t.cl', 'contador')`, [emp]);
  });

  it('el contador crea la ficha, un anticipo y cierra el libro con su asiento', async () => {
    const ficha = { base: 600000, gratifModo: 'pct', gratifPct: 25, colacion: 50000, afp: 'habitat', salud: 'fonasa', contrato: 'indefinido', lre: {} };
    [{ id: trab }] = await b.como<{ id: string }>(CONT, `insert into trabajadores (empresa_id, rut, nombre, ficha) values ($1, '15488555-2', 'Ana', $2) returning id`, [emp, j(ficha)]);
    await b.como(CONT, `insert into rem_anticipos (empresa_id, trabajador_id, fecha, monto, mes_desc) values ($1, $2, '2026-03-10', 100000, '2026-03')`, [emp, trab]);
    const t: Trabajador = { id: trab, rut: '15488555-2', nombre: 'Ana', ...ficha, gratifModo: 'pct', anticipos: [{ fecha: '2026-03-10', monto: 100000 }] } as Trabajador;
    const ctx: ContextoRem = { P: parametrosVigentes(), eventos: [], horas: {}, libros: {} };
    const l = liquidacionMes(t, 41247.63, 69889, 2026, 3, ctx);
    const lineas = [lineaLibro(t, l, '2026-03')];
    const tot = totalizar(lineas);
    const a = asientoRemuneraciones(tot, 2026, 3);
    const cerrar = () => b.como<{ numero: number }>(CONT, `select * from cerrar_libro_remuneraciones($1, '2026-03', 41247.63, 69889, $2, $3, $4, $5, $6)`,
      [emp, j(lineas), j(tot), a.fecha, a.glosa, j(a.lineas)]);
    await expect(cerrar()).rejects.toThrow(/Falta la UF/);
    await expect(b.como(CONT, `select guardar_indicador('2026-03', 4124763, 69889)`)).rejects.toThrow(/fuera de rango/);
    await b.db.exec(`insert into auth.users (id, email) values ('99999999-9999-9999-9999-999999999999', 'x@t.cl')`);
    await expect(b.como('99999999-9999-9999-9999-999999999999', `select guardar_indicador('2026-03', 41000, 69889)`)).rejects.toThrow(/administrador o contador/);
    await expect(b.como(CONT, `insert into indicadores (periodo, uf) values ('2026-04', 41000)`)).rejects.toThrow();
    await b.como(CONT, `select guardar_indicador('2026-03', 41000, 69889)`);
    await expect(cerrar()).rejects.toThrow(/Recalcula/);
    await b.como(CONT, `select guardar_indicador('2026-03', 41247.63, null)`);
    await b.como(CONT, `select guardar_indicador('2026-04', null, 69889)`);
    await expect(b.como(CONT, `select guardar_indicador('2026-04', null, null)`)).rejects.toThrow(/Indica la UF o la UTM/);
    expect(await b.como(CONT, `select uf, utm::text from indicadores where periodo = '2026-04'`)).toEqual([{ uf: null, utm: '69889' }]);
    expect(await b.como(CONT, `select uf::text, utm::text from indicadores where periodo = '2026-03'`)).toEqual([{ uf: '41247.63', utm: '69889' }]);
    const [r] = await cerrar();
    expect(r.numero).toBeGreaterThan(0);
    const [{ ant }] = await b.como<{ ant: string }>(CONT, `select sum(haber)::text ant from asiento_lineas where empresa_id=$1 and cuenta='1106001'`, [emp]);
    expect(Number(ant)).toBe(100000);
  });

  it('un mes cerrado no admite nuevos anticipos ni reabrirlo el contador', async () => {
    await expect(b.como(CONT, `insert into rem_anticipos (empresa_id, trabajador_id, fecha, monto, mes_desc) values ($1, $2, '2026-03-20', 1, '2026-03')`, [emp, trab])).rejects.toThrow();
    await expect(b.como(CONT, `select reabrir_libro_remuneraciones($1, '2026-03')`, [emp])).rejects.toThrow(/administrador/);
  });

  it('el impuesto único del F29 sale del asiento de remuneraciones; reabrir lo anula', async () => {
    await b.como(ADMIN, `select reabrir_libro_remuneraciones($1, '2026-03')`, [emp]);
    const [{ n }] = await b.como<{ n: number }>(ADMIN, `select count(*)::int n from asientos where empresa_id=$1 and tipo='remuneraciones' and not anulado`, [emp]);
    expect(n).toBe(0);
    await b.como(CONT, `insert into rem_anticipos (empresa_id, trabajador_id, fecha, monto, mes_desc) values ($1, $2, '2026-03-20', 1, '2026-03')`, [emp, trab]);
  });

  it('el RUT del trabajador debe ser válido y único', async () => {
    await expect(b.como(CONT, `insert into trabajadores (empresa_id, rut, nombre) values ($1, '15488555-3', 'X')`, [emp])).rejects.toThrow();
    await expect(b.como(CONT, `insert into trabajadores (empresa_id, rut, nombre) values ($1, '15488555-2', 'X')`, [emp])).rejects.toThrow();
  });
});
