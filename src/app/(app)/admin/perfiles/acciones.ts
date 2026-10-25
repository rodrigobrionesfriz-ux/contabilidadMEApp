'use server';

import { revalidatePath } from 'next/cache';
import { crearClienteServidor } from '@/lib/supabase/server';
import { MODULOS } from '@/lib/modulos';
import { crearCuenta, claveTemporal } from '@/lib/supabase/cuentas';

type Res = { ok: true; mensaje: string } | { ok: false; error: string };
const listo = (mensaje: string): Res => { revalidatePath('/', 'layout'); return { ok: true, mensaje }; };

export async function guardarPerfil(id: string | null, nombre: string, tipo: string, permisos: Record<string, string>): Promise<Res> {
  if (!nombre.trim()) return { ok: false, error: 'Ponle un nombre al perfil.' };
  const limpio = Object.fromEntries(MODULOS.map((m) => [m.k, ['editar', 'ver', 'no'].includes(permisos[m.k]) ? permisos[m.k] : 'no']));
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('guardar_perfil_acceso', { p_id: id, p_nombre: nombre.trim(), p_tipo: tipo, p_permisos: limpio });
  if (error) return { ok: false, error: /duplicate|unique/i.test(error.message) ? 'Ya existe un perfil con ese nombre.' : error.message };
  return listo(`Perfil «${nombre.trim()}» guardado.`);
}

export async function eliminarPerfil(id: string): Promise<Res> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('eliminar_perfil_acceso', { p_id: id });
  if (error) return { ok: false, error: error.message };
  return listo('Perfil eliminado.');
}

export async function asignarPerfil(usuario: string, perfil: string | null, esAdmin: boolean): Promise<Res> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('asignar_perfil', { p_usuario: usuario, p_perfil: perfil, p_es_admin: esAdmin });
  if (error) return { ok: false, error: error.message };
  return listo('Usuario actualizado.');
}

export async function perfilUsuariosNuevos(perfil: string | null): Promise<Res> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('perfil_usuarios_nuevos', { p_perfil: perfil });
  if (error) return { ok: false, error: error.message };
  return listo('Perfil de usuarios nuevos actualizado.');
}

/**
 * Agrega un usuario al sistema con su perfil (p. ej. Senior), sin empresa. Si pide crear la cuenta, se crea con una
 * contraseña temporal para entregarle; si no, la persona se registra sola con ese correo y recibe el perfil.
 */
export async function agregarUsuarioSistema(email: string, nombre: string, perfil: string, crear: boolean): Promise<Res & { clave?: string }> {
  const correo = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return { ok: false, error: 'Correo no válido.' };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('invitar_usuario', { p_email: correo, p_perfil: perfil });
  if (error) return { ok: false, error: error.message };
  if (data === 'existente') return listo(`${correo} ya tenía cuenta: le asigné el perfil.`);
  if (!crear) return listo(`${correo} quedó agregado. Cuando cree su cuenta en Registro (con ese correo) tendrá su perfil.`);
  const clave = claveTemporal();
  const r = await crearCuenta(correo, nombre, clave);
  if (!r.ok) return { ok: false, error: `Quedó invitado, pero no pude crear la cuenta: ${r.error}` };
  revalidatePath('/', 'layout');
  return { ok: true, clave, mensaje: `Cuenta creada para ${correo}. Contraseña temporal: ${clave}${r.confirmar ? ' · Debe confirmar el correo que le llegó antes de entrar.' : ''} Pídele que la cambie en "Olvidé mi contraseña".` };
}

export async function quitarInvitacion(id: string): Promise<Res> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('quitar_invitacion', { p_id: id });
  if (error) return { ok: false, error: error.message };
  return listo('Invitación quitada.');
}
