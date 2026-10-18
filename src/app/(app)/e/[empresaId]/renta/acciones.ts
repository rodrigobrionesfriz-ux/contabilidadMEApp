'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';
import { requerirEmpresa } from '@/lib/auth';
import { lineasGasto, type LineaGasto } from '@/lib/datos/renta';
import { REGIMENES } from '@/estados/regimenes';
import type { DatosRenta } from '@/tributario/renta';

type Res = { ok: true; mensaje: string } | { ok: false; error: string };

const monto = z.number().finite().transform((v) => Math.round(v));
const linea = z.object({ lbl: z.string().max(200), monto });
const esquema = z.object({
  regimen: z.string().refine((r) => REGIMENES.some((x) => x.k === r), 'Régimen desconocido'),
  tasa: z.number().min(0).max(100).nullable(),
  perdidaArrastre: monto.refine((v) => v >= 0, 'La pérdida de arrastre no puede ser negativa'),
  rechazadas: z.array(z.string().regex(/^3\d{6}$/)).max(500),
  lineasRechazadas: z.array(z.number().int().positive()).max(5000),
  agregados: z.array(linea).max(100),
  deducciones: z.array(linea).max(100),
  creditos: z.object({ af33bis: monto, sence: monto, donaciones: monto, otros: monto }),
  basePresunta: monto.refine((v) => v >= 0, 'La base de la presunción no puede ser negativa'),
  pctPresuncion: z.number().min(0).max(100).nullable(),
  ppmManual: monto.nullable(),
  reajustePPM: z.number().min(-100).max(100),
  notas: z.string().max(4000),
});

export async function guardarRenta(empresaId: string, anio: number, datos: DatosRenta): Promise<Res> {
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) return { ok: false, error: 'Año inválido.' };
  const p = esquema.safeParse(datos);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message || 'Datos inválidos.' };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from('renta_declaraciones')
    .upsert({ empresa_id: empresaId, anio, datos: p.data, actualizado: new Date().toISOString() }).select('anio');
  if (error) return { ok: false, error: /row-level security/i.test(error.message) ? 'No tienes permiso para modificar la declaración.' : error.message };
  if (!data?.length) return { ok: false, error: 'No tienes permiso para modificar la declaración.' };
  await supabase.rpc('registrar_actividad', { p_empresa: empresaId, p_accion: 'guardar_renta', p_detalle: { anio, regimen: p.data.regimen } });
  revalidatePath(`/e/${empresaId}/renta`);
  revalidatePath(`/e/${empresaId}/dj`);
  return { ok: true, mensaje: 'Declaración guardada.' };
}

/** Movimientos de una cuenta de gasto en el año, para marcar gastos rechazados uno a uno. */
export async function movimientosCuenta(empresaId: string, anio: number, cuenta: string): Promise<{ ok: true; lineas: LineaGasto[] } | { ok: false; error: string }> {
  if (!/^3\d{6}$/.test(cuenta)) return { ok: false, error: 'Cuenta inválida.' };
  await requerirEmpresa(empresaId);
  try {
    return { ok: true, lineas: (await lineasGasto(empresaId, anio, cuenta)).filter((l) => l.cuenta === cuenta) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
