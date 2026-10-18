import { describe, it, expect, beforeAll } from 'vitest';
import { baseDePrueba } from './helpers';
import { construirBoleta } from '@/honorarios/boleta';
import { construirRegistro, cuentasDesdeBase } from '@/rcv/documento';
import { construirPago } from '@/auxiliares/pago';
import { calcularSaldos, type LineaAux, type TipoAuxiliar } from '@/auxiliares/saldos';
import { PlanCuentas } from '@/motor/plan-cuentas';
import type { DocRCV } from '@/rcv/leer';

const ADMIN = '11111111-1111-1111-1111-111111111111';

describe('auxiliares y pagos en la base', () => {
  let b: Awaited<ReturnType<typeof baseDePrueba>>;
  let emp: string;
  let plan: PlanCuentas;
  const j = (x: unknown) => JSON.stringify(x);
  const saldos = async (tipo: TipoAuxiliar) => {
    const filas = await b.como<LineaAux>(ADMIN, `select * from movimientos_auxiliar($1, $2, '2026-01-01', '2026-12-31')`, [emp, tipo]);
    return calcularSaldos(tipo, filas.map((f) => ({ ...f, fecha: String(f.fecha).slice(0, 10), debe: Number(f.debe), haber: Number(f.haber) })), new Map(), '2026-04-30');
  };

  beforeAll(async () => {
    b = await baseDePrueba();
    await b.db.exec(`insert into auth.users (id, email) values ('${ADMIN}', 'a@t.cl')`);
    emp = (await b.como<{ id: string }>(ADMIN, `select crear_empresa('76151704-K', 'Agrícola SpA') id`))[0].id;
    const filas = await b.como(ADMIN, `select codigo,nombre,tipo,naturaleza,acepta_movimientos,acepta_centro_costo,requiere_centro_costo,tipo_auxiliar,activa from cuentas where empresa_id=$1`, [emp]);
    plan = new PlanCuentas(cuentasDesdeBase(filas as never));
  });

  it('boleta de honorarios queda como documento con saldo líquido por pagar', async () => {
    const r = construirBoleta({ numero: '45', fecha: '2026-03-10', rut: '15488555-2', nombre: 'Juan Pérez', bruto: 500000, conRetencion: true }, plan);
    if (!r.ok) throw new Error(r.errores.join());
    await b.como(ADMIN, `select * from registrar_documento($1, $2, $3)`, [emp, j(r.registro.documento), j(r.registro.asiento)]);
    const [h] = await saldos('honorario');
    expect(h).toMatchObject({ rut: '15488555-2', saldo: 423750 });
    expect(h.items[0]).toMatchObject({ folio: '45', tipo_dte: 70 });
  });

  it('pago parcial y luego total de una factura de proveedor', async () => {
    const doc: DocRCV = { fecha: '2026-03-05', fechaVencimiento: '2026-04-04', fechaVencimientoOrigen: 'estimado30d', fechaRecepcionSII: '', fechaAcuseSII: '',
      tipoDTE: 33, numero: '100', rutCodigo: '77684700', rutDV: '3', razonSocial: 'Ferretería', neto: 100000, exento: 0, iva: 19000,
      tratamientoIVA: 'recuperable', otrosImpuestos: 0, tratamientoOtrosImpuestos: 'costo', otrosImpuestosDetalle: [], total: 119000, netoAF: 0 };
    const r = construirRegistro('compra', doc, '2026-03', { cuenta: '3202010' }, plan);
    if (!r.ok) throw new Error();
    await b.como(ADMIN, `select * from registrar_documento($1, $2, $3)`, [emp, j(r.registro.documento), j(r.registro.asiento)]);
    let [p] = await saldos('proveedor');
    expect(p.saldo).toBe(119000);
    const pagar = async (monto: number) => {
      const pg = construirPago('proveedor', [{ rut: p.rut, razon: 'Ferretería', item: p.items[0], monto }], '1101201');
      if (!pg.ok) throw new Error(pg.errores.join());
      await b.como(ADMIN, `select * from crear_asiento($1, '2026-03-20', $2, $3, 'pago')`, [emp, pg.glosa, j(pg.lineas)]);
    };
    await pagar(19000);
    [p] = await saldos('proveedor');
    expect(p.saldo).toBe(100000);
    await pagar(100000);
    expect((await saldos('proveedor'))[0].saldo).toBe(0);
  });

  it('el gasto de honorarios no se mezcla con la deuda', async () => {
    const filas = await b.como<{ cuenta: string }>(ADMIN, `select distinct cuenta from movimientos_auxiliar($1, 'honorario', '2026-01-01', '2026-12-31')`, [emp]);
    expect(filas.map((f) => f.cuenta)).toEqual(['2102006']);
  });
});
