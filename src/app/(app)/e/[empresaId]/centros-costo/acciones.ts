'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';
import type { EstadoForm } from '../../../../(auth)/acciones';

const ESTADOS = ['normal', 'operativo', 'formacion', 'capitalizado'] as const;

export async function crearCentro(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const p = z.object({
    empresaId: z.guid(),
    codigo: z.string().trim().min(1, 'Ingresa un código').max(30).regex(/^[A-Za-z0-9_.-]+$/, 'El código sólo admite letras, números, punto, guion y guion bajo'),
    nombre: z.string().trim().min(2, 'Ingresa el nombre'),
    padre: z.string().trim().transform((s) => s || null),
    estado: z.enum(ESTADOS),
  }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const { empresaId, ...c } = p.data;
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from('centros_costo').insert({ empresa_id: empresaId, ...c, nivel: c.padre ? 2 : 1 });
  if (error) return { error: /duplicate|unique/i.test(error.message) ? `Ya existe un centro con código ${c.codigo}` : error.message };
  revalidatePath(`/e/${empresaId}/centros-costo`);
  return { ok: `Centro ${c.codigo} creado.` };
}

export async function actualizarCentro(empresaId: string, codigo: string, cambios: { nombre?: string; estado?: string; activo?: boolean }) {
  const p = z.object({ nombre: z.string().trim().min(2).optional(), estado: z.enum(ESTADOS).optional(), activo: z.boolean().optional() }).safeParse(cambios);
  if (!p.success) return { error: 'Cambio no válido' };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from('centros_costo').update(p.data).eq('empresa_id', empresaId).eq('codigo', codigo).select('codigo');
  if (error) return { error: error.message };
  if (!data.length) return { error: 'No tienes permiso para este cambio.' };
  revalidatePath(`/e/${empresaId}/centros-costo`);
  return {};
}
