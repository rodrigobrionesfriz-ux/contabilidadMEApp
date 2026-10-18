'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';
import type { EstadoForm } from '../../../../(auth)/acciones';

const rol = z.enum(['admin', 'contador', 'consulta']);

export async function agregarUsuario(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const p = z.object({ empresaId: z.guid(), email: z.string().trim().email('Correo no válido'), rol }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('agregar_miembro', { p_empresa: p.data.empresaId, p_email: p.data.email, p_rol: p.data.rol });
  if (error) return { error: error.message };
  revalidatePath(`/e/${p.data.empresaId}/usuarios`);
  return { ok: `${p.data.email} agregado.` };
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
