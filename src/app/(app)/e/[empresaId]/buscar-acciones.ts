'use server';

import { crearClienteServidor } from '@/lib/supabase/server';

export interface ResultadoBusqueda { tipo: string; id: string; titulo: string; sub: string; href: string }

/** Búsqueda global (Ctrl+K): documentos, asientos, trabajadores, cuentas, activos y productos. */
export async function buscarGlobal(empresaId: string, texto: string): Promise<ResultadoBusqueda[]> {
  const q = String(texto || '').slice(0, 80).trim();
  if (q.length < 2) return [];
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('buscar_global', { p_empresa: empresaId, p_texto: q });
  if (error) return [];
  const base = `/e/${empresaId}`;
  return (data as { tipo: string; id: string; titulo: string; sub: string; ref: string | null }[]).map((r) => ({
    ...r,
    href: r.tipo === 'documento' ? (r.ref ? `${base}/asientos/${r.ref}` : `${base}/libro`)
      : r.tipo === 'asiento' ? `${base}/asientos/${r.id}`
        : r.tipo === 'trabajador' ? `${base}/remuneraciones/trabajador/${r.id}`
          : r.tipo === 'cuenta' ? `${base}/mayor?cuenta=${r.id}`
            : r.tipo === 'activo' ? `${base}/activo-fijo?anio=${r.ref}`
              : `${base}/inventario?tab=productos`,
  }));
}
