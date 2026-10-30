'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';

const ficha = z.object({
  empresaId: z.guid(),
  tipo: z.enum(['proveedor', 'cliente']),
  rut: z.string().trim().min(3, 'Ingresa el RUT'),
  razonSocial: z.string().trim().min(1, 'Ingresa la razón social').max(200),
  cuenta: z.string().trim().max(20).optional(),
  cc: z.string().trim().max(40).optional(),
  formaPago: z.enum(['clientes', 'banco', 'deudores', 'tarjetas', '']).optional(),
  giro: z.string().trim().max(200).optional(),
  email: z.string().trim().max(200).optional(),
  telefono: z.string().trim().max(50).optional(),
  direccion: z.string().trim().max(300).optional(),
  activo: z.boolean().default(true),
});

export type ResFicha = { ok: true; mensaje: string } | { ok: false; error: string };

export async function guardarFicha(e: z.input<typeof ficha>): Promise<ResFicha> {
  const p = ficha.safeParse(e);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const f = p.data;
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('guardar_auxiliar', {
    p_empresa: f.empresaId, p_tipo: f.tipo, p_rut: f.rut, p_razon_social: f.razonSocial, p_cuenta: f.cuenta || null, p_cc: f.cc || null,
    p_forma_pago: f.tipo === 'cliente' ? (f.formaPago || null) : null, p_giro: f.giro || null, p_email: f.email || null,
    p_telefono: f.telefono || null, p_direccion: f.direccion || null, p_activo: f.activo,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/e/${f.empresaId}/fichas`);
  return { ok: true, mensaje: data ? `Ficha de ${f.razonSocial} creada.` : `Ficha de ${f.razonSocial} actualizada.` };
}
