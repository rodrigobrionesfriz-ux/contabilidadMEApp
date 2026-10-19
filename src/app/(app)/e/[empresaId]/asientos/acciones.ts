'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';

const linea = z.object({
  cuenta: z.string().trim().min(1, 'Falta la cuenta'),
  debe: z.number().int().nonnegative(),
  haber: z.number().int().nonnegative(),
  glosa: z.string().optional(),
  centro_costo: z.string().optional(),
  rut_auxiliar: z.string().optional(),
});

const asiento = z.object({
  empresaId: z.guid(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida'),
  glosa: z.string().trim().min(1, 'Ingresa la glosa'),
  lineas: z.array(linea).min(2, 'El asiento necesita al menos dos líneas'),
});

export type ResultadoAsiento = { ok: true; numero: number } | { ok: false; error: string };

export async function guardarAsiento(entrada: z.input<typeof asiento>): Promise<ResultadoAsiento> {
  const p = asiento.safeParse(entrada);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const supabase = await crearClienteServidor();
  // Toda la validación contable definitiva (cuadratura, cuentas, período, permisos) ocurre en la base.
  const { data, error } = await supabase.rpc('crear_asiento', {
    p_empresa: p.data.empresaId, p_fecha: p.data.fecha, p_glosa: p.data.glosa, p_lineas: p.data.lineas, p_tipo: 'manual',
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/e/${p.data.empresaId}`, 'layout');
  return { ok: true, numero: (data as { numero: number }[])[0].numero };
}

export async function anularAsiento(empresaId: string, id: string, motivo: string): Promise<{ error?: string }> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('anular_asiento', { p_id: id, p_motivo: motivo });
  if (error) return { error: error.message };
  revalidatePath(`/e/${empresaId}/diario`);
  return {};
}

const lineaEdicion = linea.extend({
  tipo_dte: z.string().trim().regex(/^\d{0,3}$/, 'Tipo de documento no válido').optional(),
  folio: z.string().trim().max(30).optional(),
});
const edicion = z.object({
  empresaId: z.guid(),
  id: z.guid(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida'),
  glosa: z.string().trim().min(1, 'Ingresa la glosa'),
  motivo: z.string().trim().max(300).optional(),
  lineas: z.array(lineaEdicion).min(2, 'El asiento necesita al menos dos líneas'),
});

export async function editarAsiento(entrada: z.input<typeof edicion>): Promise<ResultadoAsiento> {
  const p = edicion.safeParse(entrada);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const supabase = await crearClienteServidor();
  // Validación contable definitiva (permisos, período, cuentas, auxiliar, cuadratura) en la base.
  const { data, error } = await supabase.rpc('editar_asiento', {
    p_id: p.data.id, p_fecha: p.data.fecha, p_glosa: p.data.glosa, p_motivo: p.data.motivo || null,
    p_lineas: p.data.lineas.map((l) => ({ ...l, glosa: l.glosa || undefined, centro_costo: l.centro_costo || undefined,
      rut_auxiliar: l.rut_auxiliar || undefined, tipo_dte: l.tipo_dte || undefined, folio: l.folio || undefined })),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/e/${p.data.empresaId}`, 'layout');
  return { ok: true, numero: (data as { numero: number }[])[0].numero };
}
