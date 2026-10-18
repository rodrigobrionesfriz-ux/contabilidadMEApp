'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';
import type { EstadoForm } from '../../../../(auth)/acciones';

const AUX = z.enum(['', 'cliente', 'proveedor', 'honorario', 'trabajador']).transform((s) => s || null);

export async function crearCuenta(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const p = z.object({
    empresaId: z.guid(),
    codigo: z.string().trim().regex(/^\d{1,10}$/, 'El código debe ser numérico'),
    nombre: z.string().trim().min(2, 'Ingresa el nombre'),
    tipo: z.enum(['T', 'S', 'A', 'P', 'C', 'I']),
    naturaleza: z.enum(['', 'D', 'C']).transform((s) => s || null),
    tipo_auxiliar: AUX,
    acepta_centro_costo: z.string().optional().transform((v) => v === 'on'),
  }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const { empresaId, ...c } = p.data;
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from('cuentas').insert({
    empresa_id: empresaId, ...c, acepta_movimientos: !['T', 'S'].includes(c.tipo),
  });
  if (error) return { error: /duplicate|unique/i.test(error.message) ? `La cuenta ${c.codigo} ya existe` : error.message };
  revalidatePath(`/e/${empresaId}/plan-cuentas`);
  return { ok: `Cuenta ${c.codigo} creada.` };
}

export interface CambiosCuenta {
  nombre?: string; tipo_auxiliar?: string; acepta_centro_costo?: boolean; requiere_centro_costo?: boolean; activa?: boolean;
}

export async function actualizarCuenta(empresaId: string, codigo: string, cambios: CambiosCuenta) {
  const p = z.object({
    nombre: z.string().trim().min(2, 'Nombre muy corto').optional(),
    tipo_auxiliar: AUX.optional(),
    acepta_centro_costo: z.boolean().optional(),
    requiere_centro_costo: z.boolean().optional(),
    activa: z.boolean().optional(),
  }).safeParse(cambios);
  if (!p.success) return { error: p.error.issues[0].message };
  const datos = { ...p.data };
  if (datos.requiere_centro_costo) datos.acepta_centro_costo = true;
  if (datos.acepta_centro_costo === false) datos.requiere_centro_costo = false;
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from('cuentas').update(datos).eq('empresa_id', empresaId).eq('codigo', codigo).select('codigo');
  if (error) return { error: error.message };
  if (!data.length) return { error: 'No tienes permiso para este cambio.' };
  revalidatePath(`/e/${empresaId}/plan-cuentas`);
  return {};
}
