'use server';

import { revalidatePath } from 'next/cache';
import { crearClienteServidor } from '@/lib/supabase/server';
import { requerirUsuario } from '@/lib/auth';
import { normalizarConfig, type ConfigFolios, type FilaLibro } from '@/herramientas/folios';

type Res = { ok: true; mensaje: string; folios?: number[] } | { ok: false; error: string };
const ruta = (e: string) => `/e/${e}/hojas-foliadas`;
const esFecha = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function agregarRango(empresaId: string, desde: number, hasta: number, fecha: string): Promise<Res> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('agregar_rango_folios', { p_empresa: empresaId, p_desde: Math.trunc(desde), p_hasta: Math.trunc(hasta), p_fecha: esFecha(fecha) ? fecha : null });
  if (error) return { ok: false, error: error.message };
  revalidatePath(ruta(empresaId));
  return { ok: true, mensaje: 'Rango de folios registrado.' };
}
export async function activarRango(empresaId: string, id: string): Promise<Res> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('activar_rango_folios', { p_empresa: empresaId, p_rango: id });
  if (error) return { ok: false, error: error.message };
  revalidatePath(ruta(empresaId));
  return { ok: true, mensaje: 'Rango activo cambiado.' };
}
export async function guardarConfig(empresaId: string, c: Partial<ConfigFolios>): Promise<Res> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from('folios_config').upsert({ empresa_id: empresaId, config: normalizarConfig(c) });
  if (error) return { ok: false, error: error.message };
  return { ok: true, mensaje: 'Configuración guardada.' };
}
/** Reserva en la base el bloque de folios y guarda una página por folio (para reimprimir igual). */
export async function reservarFolios(empresaId: string, libro: string, desde: string, hasta: string, config: Partial<ConfigFolios>, paginas: FilaLibro[][]): Promise<Res> {
  if (!esFecha(desde) || !esFecha(hasta)) return { ok: false, error: 'Revisa las fechas.' };
  const u = await requerirUsuario();
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('reservar_folios', { p_empresa: empresaId, p_cantidad: paginas.length, p_libro: libro, p_desde: desde, p_hasta: hasta, p_config: normalizarConfig(config), p_paginas: paginas, p_usuario: u.email });
  if (error) return { ok: false, error: error.message };
  revalidatePath(ruta(empresaId));
  const folios = data as number[];
  return { ok: true, mensaje: `Folios ${folios[0]} a ${folios[folios.length - 1]} reservados. Después de imprimir confirma si quedaron usados o inutilizados.`, folios };
}
export async function cerrarReserva(empresaId: string, id: string, estado: 'usado' | 'inutilizado'): Promise<Res> {
  const u = await requerirUsuario();
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('cerrar_reserva_folios', { p_empresa: empresaId, p_reserva: id, p_estado: estado, p_usuario: u.email });
  if (error) return { ok: false, error: error.message };
  revalidatePath(ruta(empresaId));
  return { ok: true, mensaje: 'Control de folios actualizado.' };
}
