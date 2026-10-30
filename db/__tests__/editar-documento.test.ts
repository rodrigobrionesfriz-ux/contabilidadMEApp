import { describe, it, expect, beforeAll } from 'vitest';
import { baseDePrueba } from './helpers';
import { construirRegistro, cuentasDesdeBase } from '@/rcv/documento';
import { editarVenta, cambiosDesde } from '@/rcv/editar-venta';
import { PlanCuentas } from '@/motor/plan-cuentas';
import type { DocRCV } from '@/rcv/leer';
import type { Documento } from '@/motor/contable';

const ADMIN = '11111111-1111-1111-1111-111111111111';

describe('editar_documento (venta registrada)', () => {
  let b: Awaited<ReturnType<typeof baseDePrueba>>;
  let emp: string;
  let plan: PlanCuentas;
  const j = (x: unknown) => JSON.stringify(x);
  const venta = (numero: string): DocRCV => ({ fecha: '2026-02-05', fechaVencimiento: '2026-03-07', fechaVencimientoOrigen: 'estimado30d', fechaRecepcionSII: '', fechaAcuseSII: '',
    tipoDTE: 33, numero, rutCodigo: '77684700', rutDV: '3', razonSocial: 'Charcutería', neto: 602042, exento: 0, iva: 114388,
    tratamientoIVA: '', otrosImpuestos: 0, tratamientoOtrosImpuestos: '', otrosImpuestosDetalle: [], total: 716430, netoAF: 0, registroSII: [{ col: 'x' }] });
  const registrar = async (numero: string) => {
    const r = construirRegistro('venta', venta(numero), '2026-02', { cuenta: '4101002', formaPago: 'clientes' }, plan);
    if (!r.ok) throw new Error(r.errores.join());
    await b.como(ADMIN, `select * from registrar_documento($1, $2, $3)`, [emp, j(r.registro.documento), j(r.registro.asiento)]);
    return (await b.como<{ id: string; datos: Partial<Documento>; fecha: string; tipo_dte: number; folio: string; rut: string; razon_social: string; neto: number; exento: number; iva: number; asiento_id: string }>(ADMIN,
      `select id, datos, to_char(fecha,'YYYY-MM-DD') fecha, tipo_dte, folio, rut, razon_social, neto::int, exento::int, iva::int, asiento_id from documentos where empresa_id=$1 and folio=$2`, [emp, numero]))[0];
  };

  beforeAll(async () => {
    b = await baseDePrueba();
    await b.db.exec(`insert into auth.users (id, email) values ('${ADMIN}', 'a@t.cl')`);
    emp = (await b.como<{ id: string }>(ADMIN, `select crear_empresa('76151704-K', 'Agrícola SpA') id`))[0].id;
    const filas = await b.como(ADMIN, `select codigo,nombre,tipo,naturaleza,acepta_movimientos,acepta_centro_costo,requiere_centro_costo,tipo_auxiliar,activa from cuentas where empresa_id=$1`, [emp]);
    plan = new PlanCuentas(cuentasDesdeBase(filas as never));
  });

  it('cambia la forma de cobro y el folio: mismo N° de asiento, cuenta de banco, datos conservados y auditoría', async () => {
    const d = await registrar('7');
    const [{ numero: antes }] = await b.como<{ numero: number }>(ADMIN, `select numero from asientos where id=$1`, [d.asiento_id]);
    const r = editarVenta(d.datos, { ...cambiosDesde(d.datos, d), formaPago: 'banco', numero: '8' }, plan);
    if (!r.ok) throw new Error(r.errores.join());
    const [res] = await b.como<{ numero: number }>(ADMIN, `select * from editar_documento($1, $2, $3)`, [d.id, j(r.documento), j(r.asiento)]);
    expect(res.numero).toBe(antes);
    const [doc] = await b.como<{ folio: string; fp: string; reg: unknown }>(ADMIN, `select folio, datos->>'formaPago' fp, datos->'registroSII' reg from documentos where id=$1`, [d.id]);
    expect(doc).toEqual({ folio: '8', fp: 'banco', reg: [{ col: 'x' }] });
    const lineas = await b.como<{ cuenta: string }>(ADMIN, `select cuenta from asiento_lineas where asiento_id=$1 order by orden`, [d.asiento_id]);
    expect(lineas.map((l) => l.cuenta)).toContain('1101201');
    expect(lineas.map((l) => l.cuenta)).not.toContain('1104001');
    expect(await b.como(ADMIN, `select count(*)::int n from auditoria where accion='editar_documento'`)).toEqual([{ n: 1 }]);
  });

  it('no deja cambiar el folio a uno que ya existe', async () => {
    const d = await registrar('20');
    await registrar('21');
    const r = editarVenta(d.datos, { ...cambiosDesde(d.datos, d), numero: '21' }, plan);
    if (!r.ok) throw new Error(r.errores.join());
    await expect(b.como(ADMIN, `select * from editar_documento($1, $2, $3)`, [d.id, j(r.documento), j(r.asiento)])).rejects.toThrow(/Documento duplicado/);
  });
});
