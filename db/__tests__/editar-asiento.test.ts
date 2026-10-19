import { describe, it, expect, beforeAll } from 'vitest';
import { baseDePrueba } from './helpers';

const ADMIN = '11111111-1111-1111-1111-111111111111';
const CONS = '33333333-3333-3333-3333-333333333333';

describe('editar un comprobante', () => {
  let b: Awaited<ReturnType<typeof baseDePrueba>>;
  let emp: string;
  let id: string;
  const j = (x: unknown) => JSON.stringify(x);
  const editar = (fecha: string, lineas: unknown[], uid = ADMIN, glosa = 'Flete corregido') =>
    b.como<{ asiento_id: string; numero: number }>(uid, `select * from editar_asiento($1, $2, $3, $4, 'Corrección de prueba')`, [id, fecha, glosa, j(lineas)]);
  const lineas = [
    { cuenta: '3202026', debe: 532280, haber: 0, glosa: 'Flete maíz' },
    { cuenta: '1108002', debe: 101133, haber: 0 },
    { cuenta: '2102001', debe: 0, haber: 633413, rut_auxiliar: '14513781-0', tipo_dte: '33', folio: '179' },
  ];

  beforeAll(async () => {
    b = await baseDePrueba();
    await b.db.exec(`insert into auth.users (id, email) values ('${ADMIN}', 'a@t.cl'), ('${CONS}', 'q@t.cl')`);
    emp = (await b.como<{ id: string }>(ADMIN, `select crear_empresa('76151704-K', 'Agrícola SpA') id`))[0].id;
    await b.como(ADMIN, `select agregar_miembro($1, 'q@t.cl', 'consulta')`, [emp]);
    id = (await b.como<{ id: string }>(ADMIN, `select id from crear_asiento($1, '2026-05-04', 'Flete', $2)`, [emp, j(lineas)]))[0].id;
  });

  it('cambia glosa, fecha y montos conservando el número, con la versión anterior en auditoría', async () => {
    const nuevas = [{ ...lineas[0], debe: 532281, glosa: 'Flete maíz (corregido)' }, lineas[1], { ...lineas[2], haber: 633414 }];
    const [r] = await editar('2026-05-06', nuevas);
    expect(r.numero).toBe(1);
    const [a] = await b.como<{ fecha: string; glosa: string }>(ADMIN, `select fecha::text, glosa from asientos where id = $1`, [id]);
    expect(a).toEqual({ fecha: '2026-05-06', glosa: 'Flete corregido' });
    const ls = await b.como<{ debe: string; haber: string; glosa: string | null; rut_auxiliar: string | null; folio: string | null }>(ADMIN,
      `select debe, haber, glosa, rut_auxiliar, folio from asiento_lineas where asiento_id = $1 order by orden`, [id]);
    expect(Number(ls[0].debe)).toBe(532281);
    expect(ls[0].glosa).toBe('Flete maíz (corregido)');
    expect(ls[2]).toMatchObject({ rut_auxiliar: '14513781-0', folio: '179' });
    const [au] = await b.como<{ detalle: { motivo: string; antes: { lineas: unknown[]; glosa: string } } }>(ADMIN,
      `select detalle from auditoria where empresa_id = $1 and accion = 'editar_asiento' order by id desc limit 1`, [emp]);
    expect(au.detalle.motivo).toBe('Corrección de prueba');
    expect(au.detalle.antes.glosa).toBe('Flete');
    expect(au.detalle.antes.lineas).toHaveLength(3);
  });

  it('valida permisos, cuadratura, auxiliar y año', async () => {
    await expect(editar('2026-05-06', lineas, CONS)).rejects.toThrow(/permiso/);
    await expect(editar('2026-05-06', [lineas[0], lineas[1], { ...lineas[2], haber: 1 }])).rejects.toThrow(/no cuadra/);
    await expect(editar('2026-05-06', [lineas[0], lineas[1], { cuenta: '2102001', debe: 0, haber: 633413 }])).rejects.toThrow(/requiere auxiliar/);
    await expect(editar('2027-01-02', lineas)).rejects.toThrow(/año 2026/);
    await expect(editar('2026-05-06', lineas, ADMIN, '  ')).rejects.toThrow(/glosa/);
  });

  it('no edita en meses cerrados ni asientos anulados', async () => {
    await b.como(ADMIN, `select cerrar_periodo($1, '2026-04')`, [emp]);
    await expect(editar('2026-04-30', lineas)).rejects.toThrow(/2026-04 está cerrado/);
    await b.como(ADMIN, `select anular_asiento($1, 'Prueba')`, [id]);
    await expect(editar('2026-05-06', lineas)).rejects.toThrow(/anulado/);
  });
});
