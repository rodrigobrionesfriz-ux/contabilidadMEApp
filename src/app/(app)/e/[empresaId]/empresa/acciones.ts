'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';
import { rutParse } from '@/motor/rut';
import type { EstadoForm } from '../../../../(auth)/acciones';

const opt = z.string().trim().transform((s) => s || null);

export async function guardarEmpresa(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const p = z.object({
    empresaId: z.guid(),
    razon_social: z.string().trim().min(2, 'Ingresa la razón social'),
    giro: opt, domicilio: opt, comuna: opt, ciudad: opt, representante: opt,
    rut_representante: opt.refine((r) => !r || rutParse(r).valido, 'RUT del representante no válido'),
    tasa_ppm: z.string().trim().transform((s) => Number(s.replace(',', '.')) || 0).refine((n) => n >= 0 && n < 100, 'Tasa PPM no válida'),
    regimen: z.enum(['14D3', '14D8', '14A', '34AGRI', '34TRANS', '34MIN', 'NOSUJ']),
    tasa_renta: z.string().trim().transform((s) => (s === '' ? null : Number(s.replace(',', '.')))).refine((n) => n === null || (n >= 0 && n <= 100), 'Tasa de impuesto a la renta no válida'),
  }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const { empresaId, ...datos } = p.data;
  if (datos.rut_representante) {
    const r = rutParse(datos.rut_representante);
    datos.rut_representante = `${r.codigo}-${r.dv}`;
  }
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from('empresas').update(datos).eq('id', empresaId).select('id');
  if (error) return { error: error.message };
  if (!data.length) return { error: 'No tienes permiso para modificar esta empresa.' };
  revalidatePath(`/e/${empresaId}`, 'layout');
  return { ok: 'Datos guardados.' };
}
