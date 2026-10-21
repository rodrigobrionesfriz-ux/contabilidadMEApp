import { describe, it, expect, beforeAll } from 'vitest';
import { baseDePrueba } from './helpers';
import { construirRegistro, cuentasDesdeBase } from '@/rcv/documento';
import { PlanCuentas } from '@/motor/plan-cuentas';
import type { DocRCV } from '@/rcv/leer';

const ADMIN = '11111111-1111-1111-1111-111111111111';

describe('validador de documentos duplicados (RCV y registros manuales)', () => {
  let b: Awaited<ReturnType<typeof baseDePrueba>>;
  let emp: string;
  let plan: PlanCuentas;
  const j = (x: unknown) => JSON.stringify(x);
  const doc = (numero: string): DocRCV => ({ fecha: '2026-03-05', fechaVencimiento: '2026-04-04', fechaVencimientoOrigen: 'estimado30d', fechaRecepcionSII: '', fechaAcuseSII: '',
    tipoDTE: 33, numero, rutCodigo: '77684700', rutDV: '3', razonSocial: 'Ferretería', neto: 100000, exento: 0, iva: 19000,
    tratamientoIVA: 'recuperable', otrosImpuestos: 0, tratamientoOtrosImpuestos: 'costo', otrosImpuestosDetalle: [], total: 119000, netoAF: 0 });
  const registrar = (numero: string, origen: 'RCV' | 'manual' = 'RCV') => {
    const r = construirRegistro('compra', doc(numero), '2026-03', { cuenta: '3202010', origen }, plan);
    if (!r.ok) throw new Error(r.errores.join());
    return b.como<{ numero: number }>(ADMIN, `select * from registrar_documento($1, $2, $3)`, [emp, j(r.registro.documento), j(r.registro.asiento)]);
  };

  beforeAll(async () => {
    b = await baseDePrueba();
    await b.db.exec(`insert into auth.users (id, email) values ('${ADMIN}', 'a@t.cl')`);
    emp = (await b.como<{ id: string }>(ADMIN, `select crear_empresa('76151704-K', 'Agrícola SpA') id`))[0].id;
    const filas = await b.como(ADMIN, `select codigo,nombre,tipo,naturaleza,acepta_movimientos,acepta_centro_costo,requiere_centro_costo,tipo_auxiliar,activa from cuentas where empresa_id=$1`, [emp]);
    plan = new PlanCuentas(cuentasDesdeBase(filas as never));
  });

  it('el folio se compara sin ceros a la izquierda ni espacios', async () => {
    expect(await b.como(ADMIN, `select folio_normalizado(' 000518 778 ') f, folio_normalizado('0') z, folio_normalizado(null) n`)).toEqual([{ f: '518778', z: '0', n: '0' }]);
  });

  it('registrado desde el RCV, no se puede volver a registrar a mano (y dice dónde está)', async () => {
    const [{ numero }] = await registrar('518778');
    await expect(registrar('0518778', 'manual')).rejects.toThrow(new RegExp(`Documento duplicado.*RCV, asiento N° ${numero}, 05/03/2026`));
    const [d] = await b.como<{ asiento_numero: number; origen: string }>(ADMIN, `select * from documento_registrado($1, 'compra', '77.684.700-3', 33, '00518778')`, [emp]);
    expect(d).toMatchObject({ asiento_numero: numero, origen: 'RCV' });
  });

  it('registrado a mano, el RCV no lo vuelve a registrar; anulado sí se puede', async () => {
    await registrar('900', 'manual');
    await expect(registrar('900')).rejects.toThrow(/Documento duplicado.*registro manual/);
    await b.como(ADMIN, `update documentos set estado = 'anulado' where empresa_id = $1 and folio = '900'`, [emp]).catch(() => b.db.exec(`update documentos set estado = 'anulado' where folio = '900'`));
    await registrar('900');
  });

  it('el resumen del RCV cuenta como registrado el folio con ceros', async () => {
    await b.como(ADMIN, `insert into rcv_cargas (empresa_id, tipo, periodo, archivo, docs) values ($1, 'compra', '2026-03', 'x.csv', $2)`,
      [emp, j([{ tipoDTE: 33, numero: '000518778', rutCodigo: '77684700', rutDV: '3' }, { tipoDTE: 33, numero: '1', rutCodigo: '77684700', rutDV: '3' }])]);
    expect(await b.como(ADMIN, `select total, pendientes from rcv_resumen($1, 'compra')`, [emp])).toEqual([{ total: 2, pendientes: 1 }]);
  });
});
