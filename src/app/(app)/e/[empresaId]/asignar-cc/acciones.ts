'use server';

import { revalidatePath } from 'next/cache';
import { crearClienteServidor } from '@/lib/supabase/server';

export async function asignarCentro(empresaId: string, lineas: number[], cc: string | null): Promise<{ ok: true; mensaje: string } | { ok: false; error: string }> {
  const ids = [...new Set(lineas.map(Number).filter((x) => Number.isInteger(x) && x > 0))];
  if (!ids.length) return { ok: false, error: 'Selecciona al menos un movimiento.' };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('asignar_centro_costo', { p_empresa: empresaId, p_lineas: ids, p_cc: cc || null });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/e/${empresaId}/asignar-cc`);
  return { ok: true, mensaje: cc ? `Centro ${cc} asignado a ${data} movimiento(s).` : `Centro quitado de ${data} movimiento(s).` };
}
