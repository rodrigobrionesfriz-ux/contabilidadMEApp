'use server';

import { revalidatePath } from 'next/cache';
import { crearClienteServidor } from '@/lib/supabase/server';

type Res = { ok: true; mensaje: string } | { ok: false; error: string };

/** Marca o desmarca líneas del mayor como conciliadas. */
export async function marcarLineas(empresaId: string, ids: number[], conciliar: boolean): Promise<Res> {
  if (!ids.length) return { ok: true, mensaje: 'Sin cambios.' };
  const supabase = await crearClienteServidor();
  const { error } = conciliar
    ? await supabase.from('conciliacion_marcas').upsert(ids.map((linea_id) => ({ linea_id, empresa_id: empresaId })), { onConflict: 'linea_id', ignoreDuplicates: true })
    : await supabase.from('conciliacion_marcas').delete().eq('empresa_id', empresaId).in('linea_id', ids);
  if (error) return { ok: false, error: /policy/i.test(error.message) ? 'No tienes permiso para conciliar.' : error.message };
  revalidatePath(`/e/${empresaId}/conciliacion`);
  return { ok: true, mensaje: conciliar ? `${ids.length} movimiento(s) conciliado(s).` : `${ids.length} movimiento(s) desmarcado(s).` };
}

export async function guardarSaldoBanco(empresaId: string, cuenta: string, anio: number, saldo: number): Promise<Res> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from('conciliacion_saldos').upsert({ empresa_id: empresaId, cuenta, anio, saldo_banco: Math.round(saldo), actualizado: new Date().toISOString() });
  if (error) return { ok: false, error: /policy/i.test(error.message) ? 'No tienes permiso para conciliar.' : error.message };
  revalidatePath(`/e/${empresaId}/conciliacion`);
  return { ok: true, mensaje: 'Saldo según banco guardado.' };
}
