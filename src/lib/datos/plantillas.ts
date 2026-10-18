import 'server-only';
import { crearClienteServidor } from '@/lib/supabase/server';
import type { ComprobanteTipo } from '@/herramientas/comprobantes-tipo';

export function plantillaDesdeFila(f: Record<string, unknown>): ComprobanteTipo {
  return {
    id: String(f.id), nombre: String(f.nombre), descripcion: String(f.descripcion || ''), glosa: String(f.glosa || ''), guardaMontos: !!f.guarda_montos,
    lineas: (f.lineas as ComprobanteTipo['lineas']) || [], distActiva: !!f.dist_activa, distBase: Number(f.dist_base) || 0, dist: (f.dist as ComprobanteTipo['dist']) || [],
  };
}
/** Plantillas de asientos de la empresa, por nombre. */
export async function plantillasDeEmpresa(empresaId: string): Promise<ComprobanteTipo[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from('comprobantes_tipo').select('*').eq('empresa_id', empresaId).order('nombre');
  if (error) throw new Error(error.message);
  return (data ?? []).map(plantillaDesdeFila);
}
