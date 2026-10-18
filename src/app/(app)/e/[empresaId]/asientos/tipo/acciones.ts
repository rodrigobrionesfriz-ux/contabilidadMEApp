'use server';

import { revalidatePath } from 'next/cache';
import { crearClienteServidor } from '@/lib/supabase/server';
import { empresasDelUsuario, puedeEscribir } from '@/lib/auth';
import { prepararComprobante, type ComprobanteTipo } from '@/herramientas/comprobantes-tipo';
import { plantillaDesdeFila } from '@/lib/datos/plantillas';

type Res = { ok: true; mensaje: string } | { ok: false; error: string };
const fila = (d: Omit<ComprobanteTipo, 'id'>) => ({ nombre: d.nombre, descripcion: d.descripcion, glosa: d.glosa, guarda_montos: d.guardaMontos, lineas: d.lineas, dist_activa: d.distActiva, dist_base: d.distBase, dist: d.dist, actualizado: new Date().toISOString() });
const revalidar = (e: string) => { revalidatePath(`/e/${e}/asientos/tipo`); revalidatePath(`/e/${e}/asientos/nuevo`); };

export async function guardarPlantilla(empresaId: string, id: string | null, f: Omit<ComprobanteTipo, 'id'>): Promise<Res> {
  const p = prepararComprobante(f);
  if ('error' in p) return { ok: false, error: p.error };
  const supabase = await crearClienteServidor();
  // Las cuentas deben existir en el plan de la empresa
  const cds = [...new Set([...p.datos.lineas.map((l) => l.cd), ...p.datos.dist.map((d) => d.cd)].filter(Boolean))];
  if (cds.length) {
    const { data } = await supabase.from('cuentas').select('codigo').eq('empresa_id', empresaId).in('codigo', cds);
    const hay = new Set((data ?? []).map((c) => c.codigo));
    const falta = cds.filter((c) => !hay.has(c));
    if (falta.length) return { ok: false, error: `Cuenta(s) inexistente(s) en el plan: ${falta.join(', ')}` };
  }
  const { data, error } = id ? await supabase.from('comprobantes_tipo').update(fila(p.datos)).eq('id', id).eq('empresa_id', empresaId).select('id')
    : await supabase.from('comprobantes_tipo').insert({ ...fila(p.datos), empresa_id: empresaId }).select('id');
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: 'No tienes permiso para este cambio.' };
  await supabase.rpc('registrar_actividad', { p_empresa: empresaId, p_accion: id ? 'editar_plantilla' : 'crear_plantilla', p_detalle: { nombre: p.datos.nombre } });
  revalidar(empresaId);
  return { ok: true, mensaje: id ? 'Plantilla actualizada.' : 'Plantilla creada.' };
}

export async function eliminarPlantilla(empresaId: string, id: string): Promise<Res> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from('comprobantes_tipo').delete().eq('id', id).eq('empresa_id', empresaId).select('nombre');
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: 'No tienes permiso o la plantilla ya no existe.' };
  await supabase.rpc('registrar_actividad', { p_empresa: empresaId, p_accion: 'eliminar_plantilla', p_detalle: { nombre: data[0].nombre } });
  revalidar(empresaId);
  return { ok: true, mensaje: 'Plantilla eliminada.' };
}

/** Copia una plantilla a otra empresa donde el usuario puede escribir. Las cuentas que no existan allá se dejan en blanco. */
export async function copiarPlantilla(empresaId: string, id: string, destino: string): Promise<Res> {
  const empresas = await empresasDelUsuario();
  const dest = empresas.find((e) => e.id === destino);
  if (!dest || !puedeEscribir(dest.rol) || destino === empresaId) return { ok: false, error: 'Elige otra empresa donde tengas permiso de escritura.' };
  const supabase = await crearClienteServidor();
  const { data: f } = await supabase.from('comprobantes_tipo').select('*').eq('id', id).eq('empresa_id', empresaId).maybeSingle();
  if (!f) return { ok: false, error: 'La plantilla ya no existe.' };
  const c = plantillaDesdeFila(f);
  const cds = [...new Set([...c.lineas.map((l) => l.cd), ...c.dist.map((d) => d.cd)].filter(Boolean))];
  const { data: cs } = cds.length ? await supabase.from('cuentas').select('codigo').eq('empresa_id', destino).in('codigo', cds) : { data: [] };
  const hay = new Set((cs ?? []).map((x) => x.codigo));
  const { data: ccs } = await supabase.from('centros_costo').select('codigo').eq('empresa_id', destino);
  const hayCC = new Set((ccs ?? []).map((x) => x.codigo));
  const faltan = cds.filter((x) => !hay.has(x));
  const copia = { ...c, lineas: c.lineas.map((l) => ({ ...l, cd: hay.has(l.cd) ? l.cd : '', cc: hayCC.has(l.cc) ? l.cc : '' })), dist: c.dist.filter((d) => hay.has(d.cd)).map((d) => ({ ...d, cc: hayCC.has(d.cc) ? d.cc : '' })) };
  if (copia.distActiva && Math.abs(copia.dist.reduce((s, d) => s + d.pct, 0) - 100) > 0.01) { copia.distActiva = false; }
  const { error } = await supabase.from('comprobantes_tipo').insert({ ...fila(copia), empresa_id: destino });
  if (error) return { ok: false, error: error.message };
  return { ok: true, mensaje: `Plantilla copiada a ${dest.razon_social}.${faltan.length ? ` Esas cuentas no existen allá y quedaron en blanco: ${faltan.join(', ')}.` : ''}` };
}
