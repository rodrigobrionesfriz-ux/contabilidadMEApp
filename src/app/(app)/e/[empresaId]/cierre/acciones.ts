'use server';

import { revalidatePath } from 'next/cache';
import { crearClienteServidor } from '@/lib/supabase/server';
import { saldosDesde, type FilaSuma } from '@/estados/eeff';
import { clp } from '@/lib/formato';

type Res = { ok: true; mensaje: string } | { ok: false; error: string };
const ruta = (e: string) => `/e/${e}`;
const err = (m: string) => ({ ok: false as const, error: /cerrado/i.test(m) ? `${m}. Reabre el período o el ejercicio para registrar ajustes.` : m });

export async function cambiarMes(empresaId: string, periodo: string, cerrar: boolean): Promise<Res> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) return { ok: false, error: 'Período no válido.' };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc(cerrar ? 'cerrar_periodo' : 'reabrir_periodo', { p_empresa: empresaId, p_periodo: periodo });
  if (error) return { ok: false, error: error.message };
  revalidatePath(ruta(empresaId), 'layout');
  return { ok: true, mensaje: cerrar ? `Período ${periodo} cerrado.` : `Período ${periodo} reabierto.` };
}

async function saldo(empresaId: string, anio: number, cuenta: string) {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.rpc('saldos_periodo', { p_empresa: empresaId, p_desde: `${anio}-01-01`, p_hasta: `${anio}-12-31`, p_excluir_cierre: true });
  return saldosDesde((data ?? []) as FilaSuma[])[cuenta]?.saldo ?? 0;
}

/** Provisión de incobrables: % del saldo de clientes (3302001 contra 1105001), recalculado en el servidor. */
export async function provisionIncobrables(empresaId: string, anio: number, pct: number): Promise<Res> {
  if (!(pct > 0 && pct <= 100)) return { ok: false, error: 'Indica un porcentaje entre 0 y 100.' };
  const clientes = await saldo(empresaId, anio, '1104001');
  const monto = Math.round(Math.max(0, clientes) * pct / 100);
  if (monto <= 0) return { ok: false, error: 'El monto de la provisión es 0 (no hay saldo de clientes por cobrar).' };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('crear_asiento', { p_empresa: empresaId, p_fecha: `${anio}-12-31`, p_glosa: `Provisión incobrables ${anio}`, p_tipo: 'ajuste-cierre',
    p_lineas: [{ cuenta: '3302001', debe: monto, haber: 0, glosa: `Provisión incobrables ${anio}` }, { cuenta: '1105001', debe: 0, haber: monto, glosa: 'Estimación clientes incobrables' }] });
  if (error) return err(error.message);
  revalidatePath(ruta(empresaId), 'layout');
  return { ok: true, mensaje: `Asiento N° ${(Array.isArray(data) ? data[0] : data)?.numero}: provisión de incobrables por ${clp(monto)} (${String(pct).replace('.', ',')}% de ${clp(clientes)}).` };
}

/** Provisión de feriado legal (3201011 contra 2105004). */
export async function provisionFeriado(empresaId: string, anio: number, monto: number): Promise<Res> {
  monto = Math.round(monto);
  if (!(monto > 0)) return { ok: false, error: 'Indica el monto a provisionar.' };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('crear_asiento', { p_empresa: empresaId, p_fecha: `${anio}-12-31`, p_glosa: `Provisión feriado ${anio}`, p_tipo: 'ajuste-cierre',
    p_lineas: [{ cuenta: '3201011', debe: monto, haber: 0, glosa: `Provisión feriado ${anio}` }, { cuenta: '2105004', debe: 0, haber: monto, glosa: 'Provisión vacaciones' }] });
  if (error) return err(error.message);
  revalidatePath(ruta(empresaId), 'layout');
  return { ok: true, mensaje: `Asiento N° ${(Array.isArray(data) ? data[0] : data)?.numero}: provisión de feriado por ${clp(monto)}.` };
}

export async function cerrarEjercicio(empresaId: string, anio: number): Promise<Res> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('cerrar_ejercicio', { p_empresa: empresaId, p_anio: anio });
  if (error) return { ok: false, error: error.message };
  const r = (Array.isArray(data) ? data[0] : data) as { numero: number; resultado: number };
  revalidatePath(ruta(empresaId), 'layout');
  return { ok: true, mensaje: `Ejercicio ${anio} cerrado con el asiento N° ${r.numero}: ${Number(r.resultado) >= 0 ? 'utilidad' : 'pérdida'} de ${clp(Math.abs(Number(r.resultado)))} traspasada a Resultados acumulados.` };
}

export async function reabrirEjercicio(empresaId: string, anio: number, motivo: string): Promise<Res> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('reabrir_ejercicio', { p_empresa: empresaId, p_anio: anio, p_motivo: motivo });
  if (error) return { ok: false, error: error.message };
  revalidatePath(ruta(empresaId), 'layout');
  return { ok: true, mensaje: `Ejercicio ${anio} reabierto. El asiento de cierre quedó anulado con el motivo indicado.` };
}

export async function generarApertura(empresaId: string, anio: number): Promise<Res> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('generar_apertura', { p_empresa: empresaId, p_anio: anio });
  if (error) return { ok: false, error: error.message };
  const r = (Array.isArray(data) ? data[0] : data) as { numero: number };
  revalidatePath(ruta(empresaId), 'layout');
  return { ok: true, mensaje: `Apertura ${anio} generada: asiento N° ${r.numero} al 1 de enero con los saldos de balance de ${anio - 1}.` };
}
