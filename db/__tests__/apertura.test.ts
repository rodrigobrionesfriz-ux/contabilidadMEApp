import { describe, it, expect, beforeAll } from 'vitest';
import { baseDePrueba } from './helpers';

const ADMIN = '11111111-1111-1111-1111-111111111111';
const CONS = '33333333-3333-3333-3333-333333333333';

describe('balance de apertura manual (asiento N° 0)', () => {
  let b: Awaited<ReturnType<typeof baseDePrueba>>;
  let emp: string;
  const j = (x: unknown) => JSON.stringify(x);
  const guardar = (lineas: unknown[], anio = 2025, uid = ADMIN) =>
    b.como<{ asiento_id: string; numero: number; nuevo: boolean }>(uid, `select * from guardar_apertura($1, $2, '', $3)`, [emp, anio, j(lineas)]);
  const lineasDe = (anio: number) => b.como<{ cuenta: string; debe: string; haber: string; rut_auxiliar: string | null; tipo_dte: number | null; folio: string | null }>(ADMIN,
    `select l.cuenta, l.debe, l.haber, l.rut_auxiliar, l.tipo_dte, l.folio from asiento_lineas l join asientos a on a.id = l.asiento_id
     where a.empresa_id = $1 and a.anio = $2 and a.tipo = 'apertura' and not a.anulado order by l.orden`, [emp, anio]);
  const base = [
    { cuenta: '1101201', debe: 5000000, haber: 0 },
    { cuenta: '1104001', debe: 1190000, haber: 0, rut_auxiliar: '96.572.800-7', tipo_dte: '33', folio: '10' },
    { cuenta: '2301001', debe: 0, haber: 6190000 },
  ];

  beforeAll(async () => {
    b = await baseDePrueba();
    await b.db.exec(`insert into auth.users (id, email) values ('${ADMIN}', 'a@t.cl'), ('${CONS}', 'q@t.cl')`);
    emp = (await b.como<{ id: string }>(ADMIN, `select crear_empresa('76151704-K', 'Agrícola SpA') id`))[0].id;
    await b.como(ADMIN, `select agregar_miembro($1, 'q@t.cl', 'consulta')`, [emp]);
  });

  it('valida permisos, cuentas de balance, auxiliar y cuadratura', async () => {
    await expect(guardar(base, 2025, CONS)).rejects.toThrow(/permiso/);
    await expect(guardar([...base.slice(0, 2), { cuenta: '2301001', debe: 0, haber: 6190001 }])).rejects.toThrow(/no cuadra/);
    await expect(guardar([{ cuenta: '3202019', debe: 10, haber: 0 }, { cuenta: '2301001', debe: 0, haber: 10 }])).rejects.toThrow(/no es de balance/);
    await expect(guardar([{ cuenta: '1104001', debe: 10, haber: 0 }, { cuenta: '2301001', debe: 0, haber: 10 }])).rejects.toThrow(/requiere el RUT/);
    await expect(guardar([{ cuenta: '1101201', debe: 10, haber: 0 }])).rejects.toThrow(/al menos dos/);
  });

  it('crea el N° 0 al 1 de enero con auxiliar por documento', async () => {
    const [r] = await guardar(base);
    expect(r).toMatchObject({ numero: 0, nuevo: true });
    const [a] = await b.como<{ fecha: string; tipo: string; glosa: string }>(ADMIN, `select fecha::text, tipo, glosa from asientos where id = $1`, [r.asiento_id]);
    expect(a).toEqual({ fecha: '2025-01-01', tipo: 'apertura', glosa: 'Balance de apertura 2025' });
    const l = await lineasDe(2025);
    expect(l[1]).toMatchObject({ cuenta: '1104001', rut_auxiliar: '96572800-7', tipo_dte: 33, folio: '10' });
    // Los asientos normales siguen desde el 1
    const [n] = await b.como<{ numero: number }>(ADMIN, `select * from crear_asiento($1, '2025-02-01', 'Normal', $2)`,
      [emp, j([{ cuenta: '1101201', debe: 1, haber: 0 }, { cuenta: '2301001', debe: 0, haber: 1 }])]);
    expect(n.numero).toBe(1);
  });

  it('corregirla reemplaza las líneas y conserva el N° 0, con la versión anterior en auditoría', async () => {
    const [r] = await guardar([{ cuenta: '1101201', debe: 7000000, haber: 0 }, { cuenta: '2301001', debe: 0, haber: 7000000 }]);
    expect(r).toMatchObject({ numero: 0, nuevo: false });
    expect((await lineasDe(2025)).map((x) => [x.cuenta, Number(x.debe), Number(x.haber)])).toEqual([['1101201', 7000000, 0], ['2301001', 0, 7000000]]);
    const [{ n }] = await b.como<{ n: number }>(ADMIN, `select count(*)::int n from asientos where empresa_id = $1 and anio = 2025 and tipo = 'apertura'`, [emp]);
    expect(n).toBe(1);
    const [au] = await b.como<{ detalle: { reemplazo: boolean; anteriores: unknown[] } }>(ADMIN,
      `select detalle from auditoria where empresa_id = $1 and accion = 'guardar_apertura' order by id desc limit 1`, [emp]);
    expect(au.detalle.reemplazo).toBe(true);
    expect(au.detalle.anteriores).toHaveLength(3);
  });

  it('si la apertura se anula, la nueva toma el siguiente número', async () => {
    const [{ id }] = await b.como<{ id: string }>(ADMIN, `select id from asientos where empresa_id = $1 and anio = 2025 and numero = 0`, [emp]);
    await b.como(ADMIN, `select anular_asiento($1, 'Rehacer apertura')`, [id]);
    const [r] = await guardar(base);
    expect(r).toMatchObject({ numero: 2, nuevo: true });
  });

  it('no se cambia con enero cerrado y generar_apertura respeta la existente', async () => {
    await b.como(ADMIN, `select cerrar_periodo($1, '2025-01')`, [emp]);
    await expect(guardar(base)).rejects.toThrow(/Enero de 2025 está cerrado/);
    await b.como(ADMIN, `select * from crear_asiento($1, '2025-02-10', 'Venta', $2)`,
      [emp, j([{ cuenta: '1101201', debe: 500, haber: 0 }, { cuenta: '4101003', debe: 0, haber: 500 }])]);
    await b.como(ADMIN, `select * from cerrar_ejercicio($1, 2025)`, [emp]);
    await expect(guardar(base)).rejects.toThrow(/está cerrado/);
    await guardar(base, 2026);
    await expect(b.como(ADMIN, `select * from generar_apertura($1, 2026)`, [emp])).rejects.toThrow(/ya tiene un asiento de apertura/);
  });
});
