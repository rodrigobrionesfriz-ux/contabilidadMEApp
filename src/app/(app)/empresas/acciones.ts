'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';
import { rutParse } from '@/motor/rut';
import type { EstadoForm } from '../../(auth)/acciones';

const opt = z.string().trim().transform((s) => s || null);

const CAMPOS = ['rut', 'razon_social', 'giro', 'domicilio', 'comuna', 'ciudad'];

export async function crearEmpresa(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const valores = Object.fromEntries(CAMPOS.map((c) => [c, String(fd.get(c) ?? '')]));
  const p = z
    .object({
      rut: z.string().refine((r) => rutParse(r).valido, 'RUT no válido'),
      razon_social: z.string().trim().min(2, 'Ingresa la razón social'),
      giro: opt, domicilio: opt, comuna: opt, ciudad: opt,
    })
    .safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message, valores };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('crear_empresa', {
    p_rut: p.data.rut, p_razon_social: p.data.razon_social, p_giro: p.data.giro,
    p_domicilio: p.data.domicilio, p_comuna: p.data.comuna, p_ciudad: p.data.ciudad,
  });
  if (error) return { error: error.message, valores };
  redirect(`/e/${data}`);
}
