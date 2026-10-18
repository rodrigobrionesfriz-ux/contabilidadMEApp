import 'server-only';
import { crearClienteServidor } from '@/lib/supabase/server';
import { traerTodo } from '@/lib/paginar';
import { cuentasDesdeBase } from '@/rcv/documento';
import type { CuentaBase } from '@/motor/plan-cuentas';

export interface CentroOpcion { codigo: string; nombre: string; nivel: number; padre: string | null }

/** Plan de cuentas de la empresa con sus reglas (para motor y validadores). */
export async function planDeEmpresa(empresaId: string): Promise<CuentaBase[]> {
  const supabase = await crearClienteServidor();
  const filas = await traerTodo((d, h) => supabase.from('cuentas')
    .select('codigo,nombre,tipo,naturaleza,acepta_movimientos,acepta_centro_costo,requiere_centro_costo,tipo_auxiliar,activa')
    .eq('empresa_id', empresaId).order('codigo').range(d, h));
  return cuentasDesdeBase(filas);
}

export async function centrosDeEmpresa(empresaId: string): Promise<CentroOpcion[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from('centros_costo').select('codigo,nombre,nivel,padre')
    .eq('empresa_id', empresaId).eq('activo', true).order('nombre');
  if (error) throw new Error(error.message);
  return data;
}
