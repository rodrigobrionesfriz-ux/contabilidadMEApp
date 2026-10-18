import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { baseDePrueba } from './helpers';
import { leerCSV } from '@/rcv/leer';
import { construirRegistro, cuentasDesdeBase, type Registro } from '@/rcv/documento';
import { PlanCuentas } from '@/motor/plan-cuentas';

const ADMIN = '11111111-1111-1111-1111-111111111111';
const CONSULTA = '33333333-3333-3333-3333-333333333333';
const FX = path.resolve(__dirname, '../../src/rcv/__fixtures__');
const compras = leerCSV(fs.readFileSync(path.join(FX, 'rcv-compras.csv'), 'utf8'), 'compra').docs;
const ventas = leerCSV(fs.readFileSync(path.join(FX, 'rcv-ventas.csv'), 'utf8'), 'venta').docs;

describe('registro de documentos en la base', () => {
  let b: Awaited<ReturnType<typeof baseDePrueba>>;
  let emp: string;
  let plan: PlanCuentas;
  const j = (x: unknown) => JSON.stringify(x);
  const registrar = (r: Registro, uid = ADMIN) =>
    b.como<{ documento_id: string; asiento_id: string; numero: number }>(uid, `select * from registrar_documento($1, $2, $3)`,
      [emp, j(r.documento), j(r.asiento)]);

  beforeAll(async () => {
    b = await baseDePrueba();
    await b.db.exec(`insert into auth.users (id, email) values ('${ADMIN}', 'a@t.cl'), ('${CONSULTA}', 'c@t.cl')`);
    emp = (await b.como<{ id: string }>(ADMIN, `select crear_empresa('76151704-K', 'Agrícola SpA') id`))[0].id;
    await b.como(ADMIN, `select agregar_miembro($1, 'c@t.cl', 'consulta')`, [emp]);
    const filas = await b.como(ADMIN, `select codigo,nombre,tipo,naturaleza,acepta_movimientos,acepta_centro_costo,requiere_centro_costo,tipo_auxiliar,activa from cuentas where empresa_id=$1`, [emp]);
    plan = new PlanCuentas(cuentasDesdeBase(filas as never));
  });

  it('registra todas las compras y ventas del RCV con su asiento', async () => {
    for (const d of compras) {
      const r = construirRegistro('compra', d, '2026-03', { cuenta: '3202010' }, plan);
      expect(r.ok, d.numero).toBe(true);
      if (r.ok) await registrar(r.registro);
    }
    for (const d of ventas) {
      const r = construirRegistro('venta', d, '2026-03', { cuenta: '4101002' }, plan);
      if (r.ok) await registrar(r.registro);
    }
    const [{ docs, sin }] = await b.como<{ docs: number; sin: number }>(ADMIN,
      `select count(*)::int docs, count(*) filter (where asiento_id is null)::int sin from documentos where empresa_id=$1`, [emp]);
    expect(docs).toBe(compras.length + ventas.length);
    expect(sin).toBe(0);
    const bal = await b.como<{ d: string; h: string }>(ADMIN, `select sum(debe) d, sum(haber) h from balance_comprobacion($1,'2026-01-01','2026-12-31')`, [emp]);
    expect(bal[0].d).toBe(bal[0].h);
  });

  it('rechaza el mismo documento dos veces', async () => {
    const r = construirRegistro('compra', compras[0], '2026-03', { cuenta: '3202010' }, plan);
    if (!r.ok) throw new Error();
    await expect(registrar(r.registro)).rejects.toThrow(/ya está registrado/);
  });

  it('el rol consulta no registra', async () => {
    const r = construirRegistro('compra', { ...compras[0], numero: '777' }, '2026-03', { cuenta: '3202010' }, plan);
    if (!r.ok) throw new Error();
    await expect(registrar(r.registro, CONSULTA)).rejects.toThrow(/permiso/);
  });

  it('anular el documento anula su asiento y permite registrarlo de nuevo', async () => {
    const [doc] = await b.como<{ id: string; asiento_id: string }>(ADMIN,
      `select id, asiento_id from documentos where empresa_id=$1 and folio='100' and tipo='compra'`, [emp]);
    await b.como(ADMIN, `select anular_documento($1, 'Cuenta equivocada')`, [doc.id]);
    const [a] = await b.como<{ anulado: boolean }>(ADMIN, `select anulado from asientos where id=$1`, [doc.asiento_id]);
    expect(a.anulado).toBe(true);
    const r = construirRegistro('compra', compras[0], '2026-03', { cuenta: '3202011' }, plan);
    if (!r.ok) throw new Error();
    const [nuevo] = await registrar(r.registro);
    expect(nuevo.numero).toBeGreaterThan(0);
  });

  it('un período cerrado bloquea el registro', async () => {
    await b.como(ADMIN, `select cerrar_periodo($1, '2026-04')`, [emp]);
    const r = construirRegistro('compra', { ...compras[0], numero: '888', fecha: '2026-04-02' }, '2026-04', { cuenta: '3202010' }, plan);
    if (!r.ok) throw new Error();
    await expect(registrar(r.registro)).rejects.toThrow(/cerrado/);
    const [{ n }] = await b.como<{ n: number }>(ADMIN, `select count(*)::int n from documentos where folio='888'`);
    expect(n).toBe(0);
  });
});
