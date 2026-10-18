'use server';

import { revalidatePath } from 'next/cache';
import { crearClienteServidor } from '@/lib/supabase/server';
import { contextoRemuneraciones, eventosVacaciones, unirEventos } from '@/lib/datos/remuneraciones';
import { diasHabiles, saldoVacaciones, leerFeriadosTexto, type FichaVacaciones } from '@/remuneraciones/vacaciones';
import { decimalCL } from '@/lib/formato';

type Res = { ok: true; mensaje: string } | { ok: false; error?: string; confirmar?: string };
const ruta = (e: string) => `/e/${e}/remuneraciones`;
const esFecha = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const f2 = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 2 });

/** Registra vacaciones como evento de asistencia (se pagan normal y el LRE las informa). */
export async function registrarVacaciones(empresaId: string, trabajadorId: string, desde: string, hasta: string, obs: string, confirmado: boolean): Promise<Res> {
  if (!esFecha(desde) || (hasta && !esFecha(hasta))) return { ok: false, error: 'Revisa las fechas.' };
  hasta = hasta || desde;
  if (hasta < desde) return { ok: false, error: 'La fecha hasta es anterior a la fecha desde.' };
  const anio = +desde.slice(0, 4);
  const [{ ctx, trabajadores, feriados }, vac] = await Promise.all([contextoRemuneraciones(empresaId, anio), eventosVacaciones(empresaId)]);
  const t = trabajadores.find((x) => x.id === trabajadorId);
  if (!t) return { ok: false, error: 'El trabajador no existe.' };
  const r = diasHabiles(desde, hasta, feriados);
  if (!r.habiles) return { ok: false, error: 'El período no tiene días hábiles.' };
  if (!confirmado) {
    const eventos = unirEventos(ctx.eventos, vac);
    const s = saldoVacaciones(t, hasta, eventos, feriados);
    const avisos: string[] = [];
    if (s.ok && s.saldo - r.habiles < 0) avisos.push(`El saldo disponible es ${f2(s.saldo)} día(s) y se registran ${r.habiles}: quedará en negativo (vacaciones anticipadas).`);
    const choque = eventos.find((e) => e.trab === trabajadorId && e.desde <= hasta && (e.hasta || e.desde) >= desde);
    if (choque) avisos.push(`Ya hay un evento de asistencia en esas fechas (${choque.desde} a ${choque.hasta}).`);
    if (avisos.length) return { ok: false, confirmar: avisos.join('\n') + '\n¿Registrar igual?' };
  }
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from('rem_eventos').insert({ empresa_id: empresaId, trabajador_id: trabajadorId, tipo: 'vacaciones', desde, hasta, obs: obs.trim() || null });
  if (error) return { ok: false, error: error.message };
  revalidatePath(ruta(empresaId), 'layout');
  return { ok: true, mensaje: `${r.habiles} día(s) hábil(es) de vacaciones registrados para ${t.nombre}.` };
}

export async function borrarVacaciones(empresaId: string, id: string): Promise<Res> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from('rem_eventos').delete().eq('id', id).eq('empresa_id', empresaId).eq('tipo', 'vacaciones');
  if (error) return { ok: false, error: error.message };
  revalidatePath(ruta(empresaId), 'layout');
  return { ok: true, mensaje: 'Vacaciones eliminadas.' };
}

/** Saldo inicial, años con empleadores anteriores y zona extrema (se guardan en la ficha). */
export async function guardarConfigVacaciones(empresaId: string, trabajadorId: string, cfg: { aniosPrevios: string; saldoInicial: string; fechaSaldo: string; zonaExtrema: boolean }): Promise<Res> {
  const saldo = String(cfg.saldoInicial ?? '').trim();
  if (saldo && !esFecha(cfg.fechaSaldo)) return { ok: false, error: 'Indica la fecha a la que corresponde el saldo inicial.' };
  const supabase = await crearClienteServidor();
  const { data: t } = await supabase.from('trabajadores').select('ficha').eq('id', trabajadorId).eq('empresa_id', empresaId).maybeSingle();
  if (!t) return { ok: false, error: 'El trabajador no existe.' };
  const ficha = (t.ficha ?? {}) as Record<string, unknown>;
  const vacaciones: FichaVacaciones = {
    ...((ficha.vacaciones as FichaVacaciones) || {}),
    aniosPrevios: Math.max(0, Math.floor(decimalCL(cfg.aniosPrevios) || 0)),
    saldoInicial: saldo === '' ? null : decimalCL(saldo), fechaSaldo: saldo === '' ? '' : cfg.fechaSaldo, zonaExtrema: !!cfg.zonaExtrema,
  };
  const { data, error } = await supabase.from('trabajadores').update({ ficha: { ...ficha, vacaciones }, actualizado: new Date().toISOString() }).eq('id', trabajadorId).select('id');
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: 'No tienes permiso para este cambio.' };
  revalidatePath(ruta(empresaId), 'layout');
  return { ok: true, mensaje: 'Datos de vacaciones guardados.' };
}

export async function guardarFeriados(empresaId: string, texto: string): Promise<Res> {
  const { extra, quitar, malos } = leerFeriadosTexto(texto);
  if (malos.length) return { ok: false, error: 'Formato no reconocido: ' + malos.join(' | ') };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from('empresa_parametros').upsert({ empresa_id: empresaId, feriados: { extra, quitar } });
  if (error) return { ok: false, error: /policy/i.test(error.message) ? 'Sólo un administrador puede cambiar los feriados.' : error.message };
  revalidatePath(ruta(empresaId), 'layout');
  return { ok: true, mensaje: 'Feriados guardados.' };
}
