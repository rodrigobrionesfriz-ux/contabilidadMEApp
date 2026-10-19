'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';

const linea = z.object({
  cuenta: z.string().trim().regex(/^[12]\d+$/, 'La apertura sólo lleva cuentas de balance (1 y 2)'),
  debe: z.number().int().nonnegative(),
  haber: z.number().int().nonnegative(),
  rut_auxiliar: z.string().trim().optional(),
  tipo_dte: z.string().trim().regex(/^\d{0,3}$/, 'Tipo de documento no válido').optional(),
  folio: z.string().trim().max(30).optional(),
  glosa: z.string().trim().max(200).optional(),
});

const entrada = z.object({
  empresaId: z.guid(),
  anio: z.number().int().min(1990).max(2100),
  glosa: z.string().trim().max(200),
  lineas: z.array(linea).min(2, 'La apertura necesita al menos dos líneas'),
});

export type Res = { ok: true; mensaje: string } | { ok: false; error: string };

export async function guardarApertura(e: z.input<typeof entrada>): Promise<Res> {
  const p = entrada.safeParse(e);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const supabase = await crearClienteServidor();
  // Validación contable definitiva (permisos, cuentas, auxiliar, cuadratura, períodos) en la base.
  const { data, error } = await supabase.rpc('guardar_apertura', {
    p_empresa: p.data.empresaId, p_anio: p.data.anio, p_glosa: p.data.glosa,
    p_lineas: p.data.lineas.map((l) => ({ ...l, rut_auxiliar: l.rut_auxiliar || undefined, tipo_dte: l.tipo_dte || undefined, folio: l.folio || undefined, glosa: l.glosa || undefined })),
  });
  if (error) return { ok: false, error: error.message };
  const r = (Array.isArray(data) ? data[0] : data) as { numero: number; nuevo: boolean };
  revalidatePath(`/e/${p.data.empresaId}`, 'layout');
  return { ok: true, mensaje: r.nuevo
    ? `Apertura ${p.data.anio} registrada como asiento N° ${r.numero} al 1 de enero.`
    : `Apertura ${p.data.anio} actualizada (asiento N° ${r.numero}). La versión anterior quedó en el registro de actividad.` };
}
