import { describe, it, expect, beforeAll } from 'vitest';
import { baseDePrueba } from './helpers';

const ADMIN = '11111111-1111-1111-1111-111111111111';
const CONS = '33333333-3333-3333-3333-333333333333';

describe('cierre del ejercicio y apertura', () => {
  let b: Awaited<ReturnType<typeof baseDePrueba>>;
  let emp: string;
  const j = (x: unknown) => JSON.stringify(x);
  const asiento = (fecha: string, lineas: unknown[]) => b.como(ADMIN, `select * from crear_asiento($1, $2, 'Prueba', $3)`, [emp, fecha, j(lineas)]);
  beforeAll(async () => {
    b = await baseDePrueba();
    await b.db.exec(`insert into auth.users (id, email) values ('${ADMIN}', 'a@t.cl'), ('${CONS}', 'q@t.cl')`);
    emp = (await b.como<{ id: string }>(ADMIN, `select crear_empresa('76151704-K', 'Agrícola SpA') id`))[0].id;
    await b.como(ADMIN, `select agregar_miembro($1, 'q@t.cl', 'consulta')`, [emp]);
    await asiento('2026-01-02', [{ cuenta: '1101201', debe: 1000000, haber: 0 }, { cuenta: '2301001', debe: 0, haber: 1000000 }]);
    await asiento('2026-02-10', [{ cuenta: '1104001', debe: 1190000, haber: 0, rut_auxiliar: '96572800-7', tipo_dte: '33', folio: '10' },
      { cuenta: '4101003', debe: 0, haber: 1000000, centro_costo: '' }, { cuenta: '2103003', debe: 0, haber: 190000 }]);
    await asiento('2026-03-10', [{ cuenta: '3202019', debe: 100000, haber: 0, rut_auxiliar: '15488555-2' }, { cuenta: '2102006', debe: 0, haber: 100000, rut_auxiliar: '15488555-2' }]);
    await b.como(ADMIN, `select cerrar_periodo($1, '2026-03')`, [emp]);
  });

  it('no se genera la apertura de un año sin cierre y consulta no puede cerrar', async () => {
    await expect(b.como(ADMIN, `select * from generar_apertura($1, 2027)`, [emp])).rejects.toThrow(/Primero cierra/);
    await expect(b.como(CONS, `select * from cerrar_ejercicio($1, 2026)`, [emp])).rejects.toThrow(/permiso/);
  });

  it('el cierre salda resultados contra 2303001 por auxiliar y cierra los 12 meses', async () => {
    const [r] = await b.como<{ numero: number; resultado: string }>(ADMIN, `select * from cerrar_ejercicio($1, 2026)`, [emp]);
    expect(Number(r.resultado)).toBe(900000);
    const lineas = await b.como<{ cuenta: string; debe: string; haber: string; rut_auxiliar: string | null }>(ADMIN,
      `select l.cuenta, l.debe, l.haber, l.rut_auxiliar from asiento_lineas l join asientos a on a.id = l.asiento_id where a.empresa_id = $1 and a.tipo = 'cierre' order by l.orden`, [emp]);
    expect(lineas.map((l) => [l.cuenta, Number(l.debe), Number(l.haber), l.rut_auxiliar])).toEqual([
      ['3202019', 0, 100000, '15488555-2'], ['4101003', 1000000, 0, null], ['2303001', 0, 900000, null]]);
    const [{ n }] = await b.como<{ n: number }>(ADMIN, `select count(*)::int n from periodos_cerrados where empresa_id = $1 and periodo like '2026-%'`, [emp]);
    expect(n).toBe(12);
    await expect(asiento('2026-06-01', [{ cuenta: '1101201', debe: 1, haber: 0 }, { cuenta: '2301001', debe: 0, haber: 1 }])).rejects.toThrow(/cerrado/);
    await expect(b.como(ADMIN, `select * from cerrar_ejercicio($1, 2026)`, [emp])).rejects.toThrow(/ya está cerrado/);
    // Los estados financieros siguen mostrando el resultado (excluyen el asiento de cierre)
    const s = await b.como<{ cuenta: string }>(ADMIN, `select cuenta from saldos_periodo($1, '2026-01-01', '2026-12-31')`, [emp]);
    expect(s.map((x) => x.cuenta)).toContain('4101003');
    expect(s.map((x) => x.cuenta)).not.toContain('2303001');
  });

  it('la apertura del año siguiente es el N°0 con los saldos de balance por documento', async () => {
    const [r] = await b.como<{ numero: number }>(ADMIN, `select * from generar_apertura($1, 2027)`, [emp]);
    expect(r.numero).toBe(0);
    const l = await b.como<{ cuenta: string; debe: string; haber: string; rut_auxiliar: string | null; folio: string | null }>(ADMIN,
      `select l.cuenta, l.debe, l.haber, l.rut_auxiliar, l.folio from asiento_lineas l join asientos a on a.id = l.asiento_id where a.empresa_id = $1 and a.anio = 2027 order by l.orden`, [emp]);
    expect(l.map((x) => [x.cuenta, Number(x.debe), Number(x.haber), x.rut_auxiliar, x.folio])).toEqual([
      ['1101201', 1000000, 0, null, null], ['1104001', 1190000, 0, '96572800-7', '10'], ['2102006', 0, 100000, '15488555-2', null],
      ['2103003', 0, 190000, null, null], ['2301001', 0, 1000000, null, null], ['2303001', 0, 900000, null, null]]);
    await expect(b.como(ADMIN, `select * from generar_apertura($1, 2027)`, [emp])).rejects.toThrow(/ya tiene/);
  });

  it('reabrir exige motivo, anular antes la apertura, y deja los meses como estaban', async () => {
    await expect(b.como(ADMIN, `select reabrir_ejercicio($1, 2026, 'corto')`, [emp])).rejects.toThrow(/motivo/);
    await expect(b.como(ADMIN, `select reabrir_ejercicio($1, 2026, 'Falta registrar depreciación')`, [emp])).rejects.toThrow(/apertura/);
    const [{ id }] = await b.como<{ id: string }>(ADMIN, `select id from asientos where empresa_id = $1 and anio = 2027 and tipo = 'apertura'`, [emp]);
    await b.como(ADMIN, `select anular_asiento($1, 'Rehacer apertura')`, [id]);
    await b.como(ADMIN, `select reabrir_ejercicio($1, 2026, 'Falta registrar depreciación')`, [emp]);
    const meses = await b.como<{ periodo: string }>(ADMIN, `select periodo from periodos_cerrados where empresa_id = $1 order by periodo`, [emp]);
    expect(meses.map((m) => m.periodo)).toEqual(['2026-03']);
    const [{ c }] = await b.como<{ c: boolean }>(ADMIN, `select ejercicio_cerrado($1, 2026) c`, [emp]);
    expect(c).toBe(false);
    // Se puede volver a cerrar y la nueva apertura usa el siguiente número (el N°0 quedó anulado)
    await b.como(ADMIN, `select * from cerrar_ejercicio($1, 2026)`, [emp]);
    const [r] = await b.como<{ numero: number }>(ADMIN, `select * from generar_apertura($1, 2027)`, [emp]);
    expect(r.numero).toBe(1);
  });
});
