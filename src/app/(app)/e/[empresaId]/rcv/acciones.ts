'use server';

import { revalidatePath } from 'next/cache';
import { crearClienteServidor } from '@/lib/supabase/server';
import { planDeEmpresa } from '@/lib/datos/maestros';
import { PlanCuentas } from '@/motor/plan-cuentas';
import { construirRegistro, refDocumento, type Asignacion } from '@/rcv/documento';
import type { DocRCV, TipoRCV } from '@/rcv/leer';

export interface ItemRegistro { doc: DocRCV; asignacion: Asignacion }
export interface ResultadoItem { ref: string; ok: boolean; numero?: number; error?: string }

/**
 * Registra documentos (desde el RCV o ingreso manual). El asiento se recalcula aquí con el
 * motor y el plan de cuentas de la base; lo que mande el navegador sólo son datos del documento.
 */
export async function registrarDocumentos(empresaId: string, tipo: TipoRCV, periodo: string, items: ItemRegistro[]): Promise<ResultadoItem[]> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) return items.map((i) => ({ ref: refDocumento(tipo, i.doc), ok: false, error: 'Período no válido' }));
  if (tipo !== 'compra' && tipo !== 'venta') return [];
  if (items.length > 100) throw new Error('Envía como máximo 100 documentos por vez');
  const supabase = await crearClienteServidor();
  const plan = new PlanCuentas(await planDeEmpresa(empresaId));
  const out: ResultadoItem[] = [];
  for (const it of items) {
    const ref = refDocumento(tipo, it.doc);
    const r = construirRegistro(tipo, it.doc, periodo, it.asignacion, plan);
    if (!r.ok) { out.push({ ref, ok: false, error: r.errores.join(' ') }); continue; }
    const { data, error } = await supabase.rpc('registrar_documento', { p_empresa: empresaId, p_doc: r.registro.documento, p_asiento: r.registro.asiento });
    if (error) out.push({ ref, ok: false, error: error.message });
    else out.push({ ref, ok: true, numero: (data as { numero: number }[])[0]?.numero });
  }
  revalidatePath(`/e/${empresaId}`, 'layout');
  return out;
}

export async function anularDocumento(empresaId: string, id: string, motivo: string): Promise<{ error?: string }> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('anular_documento', { p_id: id, p_motivo: motivo });
  if (error) return { error: error.message };
  revalidatePath(`/e/${empresaId}`, 'layout');
  return {};
}

export interface EstadoPrevio {
  /** Claves rut|dte|folio ya registradas (no anuladas) */
  existentes: string[];
  /** Última cuenta y CC usados por RUT, para proponer en documentos nuevos */
  ultima: Record<string, { cuenta: string; cc: string; formaPago?: string }>;
}

export async function consultarPrevios(empresaId: string, tipo: TipoRCV, ruts: string[]): Promise<EstadoPrevio> {
  const supabase = await crearClienteServidor();
  const unicos = [...new Set(ruts)].slice(0, 2000);
  const existentes: string[] = [];
  const ultima: EstadoPrevio['ultima'] = {};
  for (let i = 0; i < unicos.length; i += 150) {
    const { data, error } = await supabase.from('documentos')
      .select('rut,tipo_dte,folio,estado,fecha,cuenta:datos->dist->0->>cuenta,cc:datos->dist->0->>cc,ingreso:datos->>cuentaIngreso,fp:datos->>formaPago')
      .eq('empresa_id', empresaId).eq('tipo', tipo).in('rut', unicos.slice(i, i + 150))
      .order('fecha', { ascending: false }).limit(1000);
    if (error) throw new Error(error.message);
    for (const d of data as { rut: string; tipo_dte: number; folio: string; estado: string | null; cuenta: string | null; cc: string | null; ingreso: string | null; fp: string | null }[]) {
      if (d.estado !== 'anulado') existentes.push(`${d.rut.replace('-', '')}|${d.tipo_dte}|${d.folio}`);
      const cuenta = d.cuenta || d.ingreso;
      if (cuenta && !ultima[d.rut] && d.estado !== 'anulado') ultima[d.rut] = { cuenta, cc: d.cc ?? '', ...(d.fp ? { formaPago: d.fp } : {}) };
    }
  }
  return { existentes, ultima };
}
