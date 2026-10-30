'use server';

import { revalidatePath } from 'next/cache';
import { crearClienteServidor } from '@/lib/supabase/server';
import { PlanCuentas } from '@/motor/plan-cuentas';
import { planDeEmpresa } from '@/lib/datos/maestros';
import type { Documento } from '@/motor/contable';
import { cambiosDesde, editarVenta, type CambiosVenta } from '@/rcv/editar-venta';

const ID = /^[0-9a-f-]{36}$/i;

async function leerVenta(empresaId: string, id: string) {
  if (!ID.test(id)) throw new Error('Documento no válido');
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from('documentos')
    .select('id,tipo,estado,fecha,tipo_dte,folio,rut,razon_social,neto,exento,iva,total,datos,asiento:asientos(numero,fecha)')
    .eq('empresa_id', empresaId).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.tipo !== 'venta') throw new Error('Venta no encontrada');
  return { supabase, d: data as unknown as { estado: string | null; fecha: string; tipo_dte: number; folio: string; rut: string; razon_social: string | null; neto: number; exento: number; iva: number; datos: Partial<Documento>; asiento: { numero: number; fecha: string } | null } };
}

/** Datos de la venta para el formulario de edición. */
export async function datosVenta(empresaId: string, id: string): Promise<{ ok: true; cambios: CambiosVenta; asiento: number | null; lineasReparto: number } | { ok: false; error: string }> {
  try {
    const { d } = await leerVenta(empresaId, id);
    if (d.estado === 'anulado') return { ok: false, error: 'El documento está anulado.' };
    return { ok: true, cambios: cambiosDesde(d.datos, d), asiento: d.asiento?.numero ?? null, lineasReparto: (d.datos.dist ?? []).filter((l) => l?.cuenta).length };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

/** Guarda la venta editada: el servidor recalcula el asiento con el plan de la base y lo rehace con el mismo número. */
export async function guardarVenta(empresaId: string, id: string, cambios: CambiosVenta, motivo: string): Promise<{ ok: true; mensaje: string } | { ok: false; error: string }> {
  try {
    const { supabase, d } = await leerVenta(empresaId, id);
    const plan = new PlanCuentas(await planDeEmpresa(empresaId));
    const r = editarVenta(d.datos, cambios, plan);
    if (!r.ok) return { ok: false, error: r.errores.join(' ') };
    const { data, error } = await supabase.rpc('editar_documento', { p_id: id, p_doc: r.documento, p_asiento: r.asiento, p_motivo: motivo.trim() || null });
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/e/${empresaId}`, 'layout');
    return { ok: true, mensaje: `Venta ${r.documento.tipo_dte} N° ${r.documento.folio} actualizada (asiento N° ${(data as { numero: number }[])[0]?.numero}).` };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
