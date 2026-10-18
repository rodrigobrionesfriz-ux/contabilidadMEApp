'use server';

import { crearClienteServidor } from '@/lib/supabase/server';

export async function registrarIECV(empresaId: string, tipo: string, periodo: string, docs: number) {
  const supabase = await crearClienteServidor();
  await supabase.rpc('registrar_actividad', { p_empresa: empresaId, p_accion: 'exportar_iecv', p_detalle: { tipo, periodo, docs } });
}
