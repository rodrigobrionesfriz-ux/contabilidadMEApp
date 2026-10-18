import { describe, it, expect, beforeAll } from 'vitest';
import { baseDePrueba } from './helpers';

const ADMIN = '11111111-1111-1111-1111-111111111111';
const CONS = '33333333-3333-3333-3333-333333333333';
const B1 = 'aaaaaaaa-0000-0000-0000-000000000001', B2 = 'aaaaaaaa-0000-0000-0000-000000000002', P1 = 'bbbbbbbb-0000-0000-0000-000000000001';
const OC = 'cccccccc-0000-0000-0000-000000000001', REC = 'dddddddd-0000-0000-0000-000000000001', M1 = 'eeeeeeee-0000-0000-0000-000000000001';

describe('inventario en la base', () => {
  let b: Awaited<ReturnType<typeof baseDePrueba>>;
  let emp: string, otra: string;
  const aplicar = (u: string, e: string, v: number, ops: unknown[]) => b.como<{ r: { version: number; folios: Record<string, string> } }>(u, `select inv_aplicar($1, $2, $3) r`, [e, v, JSON.stringify(ops)]).then((x) => x[0].r);
  beforeAll(async () => {
    b = await baseDePrueba();
    await b.db.exec(`insert into auth.users (id, email) values ('${ADMIN}', 'a@t.cl'), ('${CONS}', 'q@t.cl')`);
    emp = (await b.como<{ id: string }>(ADMIN, `select crear_empresa('76151704-K', 'Agrícola SpA') id`))[0].id;
    otra = (await b.como<{ id: string }>(ADMIN, `select crear_empresa('96572800-7', 'Otra SpA') id`))[0].id;
    await b.como(ADMIN, `select agregar_miembro($1, 'q@t.cl', 'consulta')`, [emp]);
  });

  it('crea maestros, asigna folios correlativos y exige la versión', async () => {
    const r = await aplicar(ADMIN, emp, 0, [
      { tabla: 'inv_bodegas', accion: 'insert', fila: { id: B1, codigo: 'B1', nombre: 'CENTRAL' } },
      { tabla: 'inv_bodegas', accion: 'insert', fila: { id: B2, codigo: 'B2', nombre: 'CAMPO' } },
      { tabla: 'inv_productos', accion: 'insert', fila: { id: P1, codigo: 'P000001', descripcion: 'FERTILIZANTE', cuenta_costo: '3101001' } },
    ]);
    expect(r.version).toBe(1);
    const m = await aplicar(ADMIN, emp, 1, [
      { tabla: 'inv_movimientos', accion: 'insert', folio: 'ENT', ref: 'e1', fila: { id: M1, tipo: 'ENTRADA', fecha: '2026-03-01', bodega_destino_id: B1, lineas: [{ productoId: P1, cantidad: 10, costoUnitario: 100 }] } },
      { tabla: 'inv_movimientos', accion: 'insert', folio: 'ENT', fila: { tipo: 'ENTRADA', fecha: '2026-03-02', bodega_destino_id: B1, observaciones: 'sigue a {{e1}}', lineas: [] } },
    ]);
    expect(m.folios).toEqual({ e1: 'ENT-000001' });
    const filas = await b.como<{ folio: string; observaciones: string }>(ADMIN, `select folio, observaciones from inv_movimientos where empresa_id = $1 order by folio`, [emp]);
    expect(filas).toEqual([{ folio: 'ENT-000001', observaciones: '' }, { folio: 'ENT-000002', observaciones: 'sigue a ENT-000001' }]);
    await expect(aplicar(ADMIN, emp, 1, [])).rejects.toThrow(/cambió en otro equipo/);
  });

  it('actualiza con versión del registro, rechaza ajenos, columnas extrañas y a consulta', async () => {
    await aplicar(ADMIN, emp, 2, [{ tabla: 'inv_ordenes_compra', accion: 'insert', folio: 'OC', fila: { id: OC, fecha: '2026-03-01', proveedor_rut: '76111111-1', proveedor_nombre: 'PROV', bodega_id: B1, lineas: [], estado: 'BORRADOR' } }]);
    await aplicar(ADMIN, emp, 3, [{ tabla: 'inv_ordenes_compra', accion: 'update', version: 1, fila: { id: OC, estado: 'EMITIDA' } }]);
    expect((await b.como<{ estado: string; version: number }>(ADMIN, `select estado, version from inv_ordenes_compra where id = $1`, [OC]))[0]).toEqual({ estado: 'EMITIDA', version: 2 });
    await expect(aplicar(ADMIN, emp, 4, [{ tabla: 'inv_ordenes_compra', accion: 'update', version: 1, fila: { id: OC, estado: 'ANULADA' } }])).rejects.toThrow(/cambió en otro equipo o ya no existe/);
    await expect(aplicar(ADMIN, emp, 4, [{ tabla: 'inv_movimientos', accion: 'update', fila: { id: M1, estado: 'ANULADO', hackeo: 1 } }])).rejects.toThrow(/Columna desconocida/);
    await expect(aplicar(ADMIN, emp, 4, [{ tabla: 'miembros', accion: 'insert', fila: {} }])).rejects.toThrow(/no permitida/);
    await expect(aplicar(CONS, emp, 4, [])).rejects.toThrow(/permiso/);
    // La bodega de otra empresa no se puede referenciar
    await expect(aplicar(ADMIN, otra, 0, [{ tabla: 'inv_movimientos', accion: 'insert', folio: 'ENT', fila: { tipo: 'ENTRADA', fecha: '2026-03-01', bodega_destino_id: B1, lineas: [] } }])).rejects.toThrow();
    // La recepción enlaza la entrada y su folio
    await aplicar(ADMIN, emp, 4, [
      { tabla: 'inv_recepciones', accion: 'insert', folio: 'REC', ref: 'r', fila: { id: REC, orden_compra_id: OC, proveedor_rut: '76111111-1', proveedor_nombre: 'PROV', bodega_id: B1, fecha: '2026-03-05', documento_tipo: 'GUÍA', documento_numero: '55', lineas: [] } },
      { tabla: 'inv_movimientos', accion: 'insert', folio: 'ENT', fila: { tipo: 'ENTRADA', fecha: '2026-03-05', bodega_destino_id: B1, recepcion_id: REC, observaciones: 'Recepción {{r}}', lineas: [] } },
    ]);
    expect((await b.como<{ o: string }>(CONS, `select observaciones o from inv_movimientos where recepcion_id = $1`, [REC]))[0].o).toBe('Recepción REC-000001');
    await expect(b.como(CONS, `update inv_movimientos set estado = 'ANULADO' returning id`)).rejects.toThrow();
  });

  it('cuenta líneas de una toma abierta sin pisar otras', async () => {
    const T = 'ffffffff-0000-0000-0000-000000000001';
    const v = (await b.como<{ version: number }>(ADMIN, `select version from inv_estado where empresa_id = $1`, [emp]))[0].version;
    await aplicar(ADMIN, emp, Number(v), [{ tabla: 'inv_tomas', accion: 'insert', folio: 'TOMA', fila: { id: T, bodega_id: B1, estado: 'EN_PROCESO', lineas: [{ id: 'l1', productoId: P1, fisico: null, contado: false }, { id: 'l2', productoId: P1, fisico: null, contado: false }] } }]);
    await b.como(ADMIN, `select inv_contar($1, $2, 'l1', 8, null, 'a@t.cl')`, [emp, T]);
    await b.como(ADMIN, `select inv_contar($1, $2, 'l2', null, 1500, 'a@t.cl')`, [emp, T]);
    const l = (await b.como<{ lineas: { fisico: number | null; contado: boolean; costoConteo?: number; fisicoFecha?: string }[]; version: number }>(ADMIN, `select lineas, version from inv_tomas where id = $1`, [T]))[0];
    expect(l.version).toBe(3);
    expect(l.lineas[0]).toMatchObject({ fisico: 8, contado: true, contadoPor: 'a@t.cl' });
    expect(l.lineas[0].fisicoFecha).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(l.lineas[1]).toMatchObject({ fisico: null, contado: false, costoConteo: 1500 });
    await expect(b.como(ADMIN, `select inv_contar($1, $2, 'l1', -1, null, '')`, [emp, T])).rejects.toThrow(/negativa/);
    await expect(b.como(CONS, `select inv_contar($1, $2, 'l1', 1, null, '')`, [emp, T])).rejects.toThrow(/permiso/);
    // Sin versión global, un cambio de maestro igual se aplica
    await aplicar(ADMIN, emp, null as unknown as number, [{ tabla: 'inv_bodegas', accion: 'update', fila: { id: B2, nombre: 'CAMPO NORTE' } }]);
  });
});
