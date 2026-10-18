'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { DJ_SEMILLA, ESTADOS_DJ, validarDJ, estadoVacio, type DJ, type EstadoDJ } from '@/tributario/dj';

type Res = { ok: true; mensaje: string } | { ok: false; error: string };
const ruta = (e: string) => `/e/${e}/dj`;
const sinPermiso = (m: string) => (/row-level security/i.test(m) ? 'No tienes permiso para este cambio.' : m);
const atValido = (at: number) => Number.isInteger(at) && at >= 2000 && at <= 2101;

async function catalogoActual(empresaId: string): Promise<DJ[]> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from('dj_catalogo').select('catalogo').eq('empresa_id', empresaId).maybeSingle();
  return Array.isArray(data?.catalogo) && data.catalogo.length ? (data.catalogo as DJ[]) : DJ_SEMILLA.map((d) => ({ ...d }));
}
async function estadosDe(empresaId: string, at: number): Promise<Record<string, EstadoDJ>> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from('dj_estados').select('estados').eq('empresa_id', empresaId).eq('anio_tributario', at).maybeSingle();
  return (data?.estados as Record<string, EstadoDJ>) || {};
}
async function escribirEstados(empresaId: string, at: number, estados: Record<string, EstadoDJ>) {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from('dj_estados').upsert({ empresa_id: empresaId, anio_tributario: at, estados, actualizado: new Date().toISOString() }).select('anio_tributario');
  if (error) return sinPermiso(error.message);
  if (!data?.length) return 'No tienes permiso para este cambio.';
  return null;
}
async function escribirCatalogo(empresaId: string, catalogo: DJ[]) {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from('dj_catalogo').upsert({ empresa_id: empresaId, catalogo, actualizado: new Date().toISOString() }).select('empresa_id');
  if (error) return sinPermiso(error.message);
  if (!data?.length) return 'No tienes permiso para este cambio.';
  return null;
}

const esquemaEstado = z.object({
  estado: z.enum(Object.keys(ESTADOS_DJ) as [string, ...string[]]),
  fecha: z.string().refine((s) => s === '' || /^\d{4}-\d{2}-\d{2}$/.test(s), 'Fecha inválida'),
  folio: z.string().max(60), obs: z.string().max(500),
});

/** Cambia el estado de presentación de una declaración en el año tributario (setDJEstado). */
export async function guardarEstadoDJ(empresaId: string, at: number, n: string, cambio: Partial<EstadoDJ>, hoy: string): Promise<Res> {
  if (!atValido(at)) return { ok: false, error: 'Año tributario inválido.' };
  const estados = await estadosDe(empresaId, at);
  const nuevo = { ...estadoVacio(), ...(estados[n] || {}), ...cambio };
  // Al marcar como presentada sin fecha se propone hoy: es el caso normal.
  if (cambio.estado === 'presentada' && !nuevo.fecha && /^\d{4}-\d{2}-\d{2}$/.test(hoy)) nuevo.fecha = hoy;
  const p = esquemaEstado.safeParse(nuevo);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message || 'Datos inválidos.' };
  const err = await escribirEstados(empresaId, at, { ...estados, [String(n)]: p.data });
  if (err) return { ok: false, error: err };
  if (cambio.estado) await (await crearClienteServidor()).rpc('registrar_actividad', { p_empresa: empresaId, p_accion: 'estado_dj', p_detalle: { dj: n, at, estado: cambio.estado } });
  revalidatePath(ruta(empresaId));
  return { ok: true, mensaje: 'Estado guardado.' };
}

/** Agrega o edita una declaración del catálogo de la empresa (guardarDJ). */
export async function guardarDJ(empresaId: string, at: number, orig: string | null, dj: Partial<DJ>): Promise<Res> {
  const catalogo = await catalogoActual(empresaId);
  const v = validarDJ(dj, catalogo, orig);
  if ('error' in v) return { ok: false, error: v.error };
  let nuevo: DJ[];
  if (orig == null) nuevo = [...catalogo, v.dj];
  else {
    const i = catalogo.findIndex((d) => String(d.n) === String(orig));
    if (i < 0) return { ok: false, error: 'La declaración ya no está en el catálogo.' };
    nuevo = catalogo.map((d, j) => (j === i ? { ...d, ...v.dj } : d));
  }
  const err = await escribirCatalogo(empresaId, nuevo);
  if (err) return { ok: false, error: err };
  // Si cambió el número, el estado guardado del año lo sigue (el número es la clave).
  if (orig != null && String(orig) !== v.dj.n && atValido(at)) {
    const estados = await estadosDe(empresaId, at);
    if (estados[orig]) {
      const { [orig]: mover, ...resto } = estados;
      await escribirEstados(empresaId, at, { ...resto, [v.dj.n]: mover });
    }
  }
  revalidatePath(ruta(empresaId));
  return { ok: true, mensaje: orig == null ? 'Declaración agregada.' : 'Declaración actualizada.' };
}

/** Quita una declaración propia del catálogo. Las oficiales se restauran con «Catálogo oficial». */
export async function borrarDJ(empresaId: string, n: string): Promise<Res> {
  const catalogo = await catalogoActual(empresaId);
  const d = catalogo.find((x) => String(x.n) === String(n));
  if (!d) return { ok: false, error: 'La declaración ya no está en el catálogo.' };
  if (!d.propia) return { ok: false, error: 'Solo se quitan las declaraciones agregadas por la empresa.' };
  const err = await escribirCatalogo(empresaId, catalogo.filter((x) => String(x.n) !== String(n)));
  if (err) return { ok: false, error: err };
  revalidatePath(ruta(empresaId));
  return { ok: true, mensaje: 'Declaración quitada del catálogo.' };
}

/** Vuelve al catálogo oficial que trae el sistema. El estado de presentación de cada año no se toca. */
export async function restaurarCatalogoDJ(empresaId: string): Promise<Res> {
  if (!puedeEscribir((await requerirEmpresa(empresaId)).rol)) return { ok: false, error: 'No tienes permiso para este cambio.' };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from('dj_catalogo').delete().eq('empresa_id', empresaId);
  if (error) return { ok: false, error: sinPermiso(error.message) };
  revalidatePath(ruta(empresaId));
  return { ok: true, mensaje: 'Catálogo oficial restaurado.' };
}
