'use server';

import { revalidatePath } from 'next/cache';
import { crearClienteServidor } from '@/lib/supabase/server';
import { planDeEmpresa } from '@/lib/datos/maestros';
import { PlanCuentas } from '@/motor/plan-cuentas';
import { construirBoleta, type DatosBoleta } from '@/honorarios/boleta';
import { construirPago } from '@/auxiliares/pago';

export async function registrarBoleta(empresaId: string, b: DatosBoleta, contado?: { cuenta: string; fecha: string }):
  Promise<{ ok: true; numero: number; numeroPago?: number; avisoPago?: string } | { ok: false; error: string }> {
  const plan = new PlanCuentas(await planDeEmpresa(empresaId));
  const r = construirBoleta(b, plan);
  if (!r.ok) return { ok: false, error: r.errores.join(' ') };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('registrar_documento', { p_empresa: empresaId, p_doc: r.registro.documento, p_asiento: r.registro.asiento });
  if (error) return { ok: false, error: error.message };
  const numero = (data as { numero: number }[])[0].numero;
  let numeroPago: number | undefined;
  let avisoPago: string | undefined;
  if (contado && r.liquido > 0) {
    const doc = r.registro.documento;
    const pg = construirPago('honorario', [{ rut: doc.rut, razon: doc.razon_social, item: { cuenta: '2102006', tipo_dte: doc.tipo_dte, folio: doc.folio, saldo: r.liquido }, monto: r.liquido }],
      contado.cuenta, `Pago boleta de honorarios N°${doc.folio} — ${doc.razon_social}`);
    if (pg.ok) {
      const p = await supabase.rpc('crear_asiento', { p_empresa: empresaId, p_fecha: contado.fecha, p_glosa: pg.glosa, p_lineas: pg.lineas, p_tipo: 'pago' });
      if (p.error) avisoPago = `La boleta quedó registrada, pero el pago no: ${p.error.message}. Regístralo en Pagos y cobros.`;
      else numeroPago = (p.data as { numero: number }[])[0].numero;
    } else avisoPago = pg.errores.join(' ');
  }
  revalidatePath(`/e/${empresaId}`, 'layout');
  return { ok: true, numero, numeroPago, avisoPago };
}
