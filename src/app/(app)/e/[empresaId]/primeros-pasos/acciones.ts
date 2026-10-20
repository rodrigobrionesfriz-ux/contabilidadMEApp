'use server';

import { revalidatePath } from 'next/cache';
import { crearClienteServidor } from '@/lib/supabase/server';

export async function marcarPaso(empresaId: string, paso: string, estado: 'listo' | 'omitido' | null): Promise<{ ok: boolean; error?: string }> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('marcar_paso', { p_empresa: empresaId, p_paso: paso, p_estado: estado });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/e/${empresaId}`, 'layout');
  return { ok: true };
}
