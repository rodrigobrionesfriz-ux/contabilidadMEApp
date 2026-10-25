'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';
import { crearCuenta, claveTemporal } from '@/lib/supabase/cuentas';
import type { EstadoForm } from '../../../../(auth)/acciones';

const rol = z.enum(['admin', 'contador', 'consulta']);

export async function agregarUsuario(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const p = z.object({ empresaId: z.guid(), email: z.string().trim().email('Correo no válido'), rol, nombre: z.string().trim().max(80).optional(), crear: z.string().optional() })
    .safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('agregar_miembro', { p_empresa: p.data.empresaId, p_email: p.data.email, p_rol: p.data.rol });
  if (error) return { error: error.message };
  revalidatePath(`/e/${p.data.empresaId}/usuarios`);
  if (data) return { ok: `${p.data.email} agregado a la empresa.` };
  // Aún no tiene cuenta: quedó invitado. Si se pidió, se crea la cuenta con una contraseña temporal.
  if (!p.data.crear) return { ok: `${p.data.email} quedó invitado: cuando cree su cuenta en Registro con ese correo, entrará a esta empresa.` };
  const clave = claveTemporal();
  const r = await crearCuenta(p.data.email, p.data.nombre ?? '', clave);
  if (!r.ok) return { error: `Quedó invitado, pero no pude crear la cuenta: ${r.error}` };
  return { ok: `Cuenta creada para ${p.data.email} con la contraseña temporal ${clave}.${r.confirmar ? ' Debe confirmar el correo que le llegó antes de entrar.' : ''} Pídele que la cambie en "Olvidé mi contraseña".` };
}

export async function quitarInvitacion(empresaId: string, id: string): Promise<{ error?: string }> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('quitar_invitacion', { p_id: id });
  if (error) return { error: error.message };
  revalidatePath(`/e/${empresaId}/usuarios`);
  return {};
}

export async function actualizarMiembro(empresaId: string, usuarioId: string, cambios: { rol?: string; estado?: string }) {
  const p = z.object({ rol: rol.optional(), estado: z.enum(['activo', 'inactivo']).optional() }).safeParse(cambios);
  if (!p.success) return { error: 'Cambio no válido' };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from('miembros').update(p.data)
    .eq('empresa_id', empresaId).eq('usuario_id', usuarioId).select('usuario_id');
  if (error) return { error: error.message };
  if (!data.length) return { error: 'No tienes permiso para este cambio.' };
  revalidatePath(`/e/${empresaId}`, 'layout');
  return {};
}
