import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

// Simula lo que Supabase provee: esquema auth, auth.uid() desde el JWT y el rol authenticated.
const AUTH_STUB = `
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create role authenticated nologin;
create role anon nologin;
`;

const U1 = '11111111-1111-1111-1111-111111111111';
const U2 = '22222222-2222-2222-2222-222222222222';
const U3 = '33333333-3333-3333-3333-333333333333';

let db: PGlite;

/** Ejecuta como un usuario autenticado (RLS activo). */
async function como<T = Record<string, unknown>>(uid: string, sql: string, params: unknown[] = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec('reset role;');
  }
}

const lineas = (arr: unknown[]) => JSON.stringify(arr);

describe('esquema base', () => {
  let emp1: string;
  let emp2: string;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(AUTH_STUB);
    const dir = path.resolve(__dirname, '../../supabase/migrations');
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
      await db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
    }
    await db.exec(`insert into auth.users (id, email) values
      ('${U1}', 'rodrigo@test.cl'), ('${U2}', 'otro@test.cl'), ('${U3}', 'consulta@test.cl')`);
  });

  it('crea perfiles al registrar usuarios', async () => {
    const r = await db.query('select count(*)::int n from perfiles');
    expect(r.rows[0]).toEqual({ n: 3 });
  });

  it('crear_empresa valida RUT y copia el plan de cuentas', async () => {
    await expect(como(U1, `select crear_empresa('76.151.704-5', 'Mala')`)).rejects.toThrow(/no es válido/);
    emp1 = (await como<{ id: string }>(U1, `select crear_empresa('76.151.704-K', 'Agrícola Uno SpA') id`))[0].id;
    emp2 = (await como<{ id: string }>(U2, `select crear_empresa('77684700-3', 'Comercial Dos Ltda') id`))[0].id;
    const c = await como<{ n: number }>(U1, `select count(*)::int n from cuentas where empresa_id = $1`, [emp1]);
    expect(c[0].n).toBe(295);
    const aux = await como(U1, `select codigo, tipo_auxiliar, acepta_movimientos from cuentas where empresa_id=$1 and codigo in ('1','1104001') order by codigo`, [emp1]);
    expect(aux).toEqual([
      { codigo: '1', tipo_auxiliar: null, acepta_movimientos: false },
      { codigo: '1104001', tipo_auxiliar: 'cliente', acepta_movimientos: true },
    ]);
    await expect(como(U2, `select crear_empresa('76151704-K', 'Duplicada')`)).rejects.toThrow(/Ya existe/);
  });

  it('RLS aísla empresas entre usuarios', async () => {
    expect(await como(U1, `select razon_social from empresas`)).toEqual([{ razon_social: 'Agrícola Uno SpA' }]);
    expect(await como(U2, `select razon_social from empresas`)).toEqual([{ razon_social: 'Comercial Dos Ltda' }]);
    expect(await como(U3, `select * from empresas`)).toEqual([]);
    expect(await como(U1, `select * from cuentas where empresa_id = $1`, [emp2])).toEqual([]);
    expect(await como(U2, `select * from cuentas where empresa_id = $1`, [emp1])).toEqual([]);
  });

  it('crear_asiento asigna correlativo y valida cuadratura', async () => {
    const ok = lineas([
      { cuenta: '1101201', debe: 1190 },
      { cuenta: '1104001', haber: 1190, rut_auxiliar: '15.488.555-2' },
    ]);
    const a1 = await como<{ numero: number }>(U1, `select * from crear_asiento($1, '2026-03-10', 'Cobro cliente', $2)`, [emp1, ok]);
    const a2 = await como<{ numero: number }>(U1, `select * from crear_asiento($1, '2026-03-11', 'Cobro 2', $2)`, [emp1, ok]);
    expect([a1[0].numero, a2[0].numero]).toEqual([1, 2]);
    const otroAnio = await como<{ numero: number }>(U1, `select * from crear_asiento($1, '2027-01-02', 'Nuevo año', $2)`, [emp1, ok]);
    expect(otroAnio[0].numero).toBe(1);

    const descuadre = lineas([{ cuenta: '1101201', debe: 1000 }, { cuenta: '2301001', haber: 999 }]);
    await expect(como(U1, `select * from crear_asiento($1, '2026-03-12', 'x', $2)`, [emp1, descuadre])).rejects.toThrow(/no cuadra/);
    const sinAux = lineas([{ cuenta: '1101201', debe: 10 }, { cuenta: '1104001', haber: 10 }]);
    await expect(como(U1, `select * from crear_asiento($1, '2026-03-12', 'x', $2)`, [emp1, sinAux])).rejects.toThrow(/requiere auxiliar/);
    const agrupadora = lineas([{ cuenta: '1', debe: 10 }, { cuenta: '2301001', haber: 10 }]);
    await expect(como(U1, `select * from crear_asiento($1, '2026-03-12', 'x', $2)`, [emp1, agrupadora])).rejects.toThrow(/agrupadora/);
    // un error no consume correlativo
    const a3 = await como<{ numero: number }>(U1, `select * from crear_asiento($1, '2026-03-13', 'Tercero', $2)`, [emp1, ok]);
    expect(a3[0].numero).toBe(3);
  });

  it('otro usuario no puede escribir ni leer asientos ajenos', async () => {
    const ok = lineas([{ cuenta: '1101201', debe: 5 }, { cuenta: '2301001', haber: 5 }]);
    await expect(como(U2, `select * from crear_asiento($1, '2026-03-10', 'intruso', $2)`, [emp1, ok])).rejects.toThrow(/permiso/);
    expect(await como(U2, `select * from asientos where empresa_id = $1`, [emp1])).toEqual([]);
    await expect(como(U2, `insert into asientos (empresa_id, anio, numero, fecha, glosa) values ($1, 2026, 99, '2026-01-01', 'x')`, [emp1])).rejects.toThrow();
  });

  it('rol consulta lee pero no escribe', async () => {
    await como(U1, `select agregar_miembro($1, 'consulta@test.cl', 'consulta')`, [emp1]);
    const ver = await como(U3, `select count(*)::int n from asientos where empresa_id = $1`, [emp1]);
    expect(ver[0]).toEqual({ n: 4 });
    const ok = lineas([{ cuenta: '1101201', debe: 5 }, { cuenta: '2301001', haber: 5 }]);
    await expect(como(U3, `select * from crear_asiento($1, '2026-03-10', 'x', $2)`, [emp1, ok])).rejects.toThrow(/permiso/);
  });

  it('anular conserva número y excluye saldos; período cerrado bloquea', async () => {
    const [a] = await como<{ id: string }>(U1, `select id from asientos where empresa_id=$1 and anio=2026 and numero=2`, [emp1]);
    await como(U1, `select anular_asiento($1, 'Duplicado')`, [a.id]);
    await expect(como(U1, `select anular_asiento($1, 'otra vez')`, [a.id])).rejects.toThrow(/ya está anulado/);
    const s = await como(U1, `select saldo::int from saldos_cuentas where empresa_id=$1 and anio=2026 and cuenta='1101201'`, [emp1]);
    expect(s).toEqual([{ saldo: 2380 }]);
    await como(U1, `select cerrar_periodo($1, '2026-03')`, [emp1]);
    const ok = lineas([{ cuenta: '1101201', debe: 5 }, { cuenta: '2301001', haber: 5 }]);
    await expect(como(U1, `select * from crear_asiento($1, '2026-03-31', 'x', $2)`, [emp1, ok])).rejects.toThrow(/cerrado/);
  });

  it('no permite dejar la empresa sin administrador', async () => {
    await expect(como(U1, `update miembros set rol='contador' where empresa_id=$1 and usuario_id=$2`, [emp1, U1])).rejects.toThrow(/administrador/);
  });
});
