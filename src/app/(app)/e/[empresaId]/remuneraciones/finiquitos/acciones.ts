'use server';

import { revalidatePath } from 'next/cache';
import { crearClienteServidor } from '@/lib/supabase/server';
import { traerTodo } from '@/lib/paginar';
import { contextoFiniquitos, indicadoresMes, finiquitosDeEmpresa } from '@/lib/datos/remuneraciones';
import { calcularFiniquito, propuestaAsiento, PLANTILLAS_TIPO, type FormFiniquito, type CfgAsientoFin, type CuentaPlan, type FiniquitoOk } from '@/remuneraciones/finiquito';
import { clp } from '@/lib/formato';

type Res = { ok: true; mensaje: string; id?: string } | { ok: false; error: string };
const ruta = (e: string) => `/e/${e}/remuneraciones/finiquitos`;
const esFecha = (s: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

/** Recalcula en el servidor (nunca confía en el cálculo del navegador). */
async function calcular(empresaId: string, f: FormFiniquito) {
  if (!esFecha(f.fechaTermino)) return { error: 'Indica la fecha de término.' } as const;
  const anio = +f.fechaTermino.slice(0, 4), mes = +f.fechaTermino.slice(5, 7);
  const { ctx, trabajadores, feriados } = await contextoFiniquitos(empresaId, anio);
  const t = trabajadores.find((x) => x.id === f.trab);
  if (!t) return { error: 'Selecciona el trabajador.' } as const;
  const r = calcularFiniquito(t, f, { ctx, utm: indicadoresMes(ctx.P, anio, mes).utm, feriados });
  if (!r.ok) return { error: r.motivo } as const;
  return { t, r } as const;
}

export async function guardarFiniquito(empresaId: string, id: string | null, f: FormFiniquito, texto: string | null): Promise<Res> {
  const c = await calcular(empresaId, f);
  if ('error' in c) return { ok: false, error: c.error! };
  const { t, r } = c;
  const supabase = await crearClienteServidor();
  const datos = { ...f, nombre: t.nombre, rut: t.rut };
  const calc = { total: r.total, totalHaberes: r.totalHaberes, totalDescuentos: r.totalDescuentos, lineas: r.lineas, desc: r.desc, ultimaRem: r.ultimaRem,
    baseIndem: r.baseIndem, feriado: r.feriado, ias: r.ias, sustitutiva: r.sustitutiva, afc: r.afc, inicio: r.inicio };
  const fila = { trabajador_id: t.id, fecha_termino: f.fechaTermino, causal: f.causal, datos, calc, total: r.total, texto: texto && texto.trim() ? texto : null };
  const q = id ? supabase.from('finiquitos').update(fila).eq('id', id).eq('empresa_id', empresaId).select('id')
    : supabase.from('finiquitos').insert({ ...fila, empresa_id: empresaId }).select('id');
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: 'No tienes permiso para este cambio.' };
  // Fecha y causal de término en la ficha (LRE y Previred)
  if (f.actualizarFicha) {
    const { data: tr } = await supabase.from('trabajadores').select('ficha').eq('id', t.id).maybeSingle();
    const ficha = (tr?.ficha ?? {}) as Record<string, unknown>;
    const lre = { ...((ficha.lre as Record<string, unknown>) || {}), fechaTermino: f.fechaTermino } as Record<string, unknown>;
    if (String(f.codigoLRE || '').trim()) lre.causalTermino = String(f.codigoLRE).trim();
    const { error: e2 } = await supabase.from('trabajadores').update({ ficha: { ...ficha, lre }, actualizado: new Date().toISOString() }).eq('id', t.id);
    if (e2) return { ok: true, id: data[0].id, mensaje: 'Finiquito guardado, pero no se pudo actualizar la ficha del trabajador.' };
  }
  revalidatePath(`/e/${empresaId}/remuneraciones`, 'layout');
  return { ok: true, id: data[0].id, mensaje: `Finiquito guardado: ${clp(r.total)}.` };
}

export async function ratificarFiniquito(empresaId: string, id: string, ratificado: boolean): Promise<Res> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from('finiquitos').update({ estado: ratificado ? 'ratificado' : 'borrador', ratificado_en: ratificado ? new Date().toISOString() : null })
    .eq('id', id).eq('empresa_id', empresaId).select('id');
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: 'No tienes permiso para este cambio.' };
  revalidatePath(ruta(empresaId), 'layout');
  return { ok: true, mensaje: ratificado ? 'Finiquito marcado como ratificado.' : 'Finiquito vuelto a borrador.' };
}

export async function eliminarFiniquito(empresaId: string, id: string): Promise<Res> {
  const [f] = await finiquitosDeEmpresa(empresaId, id);
  if (!f) return { ok: false, error: 'El finiquito ya no existe.' };
  if (f.asiento && !f.asiento.anulado) return { ok: false, error: `El finiquito está contabilizado (asiento N° ${f.asiento.numero}). Anula primero ese asiento en el libro diario.` };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from('finiquitos').delete().eq('id', id).eq('empresa_id', empresaId).select('id');
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: 'No tienes permiso para eliminarlo.' };
  revalidatePath(ruta(empresaId), 'layout');
  return { ok: true, mensaje: 'Finiquito eliminado. La fecha de término de la ficha no se modifica.' };
}

/** Plan (cuentas imputables) y saldo acreedor de las provisiones al día del asiento. */
export async function datosAsientoFiniquito(empresaId: string, fecha: string) {
  const supabase = await crearClienteServidor();
  const cuentas = await traerTodo((d, h) => supabase.from('cuentas').select('codigo,nombre,acepta_movimientos,acepta_centro_costo,tipo_auxiliar').eq('empresa_id', empresaId).eq('activa', true).order('codigo').range(d, h));
  const saldos: Record<string, number> = {};
  if (esFecha(fecha)) {
    const { data } = await supabase.rpc('balance_comprobacion', { p_empresa: empresaId, p_desde: `${fecha.slice(0, 4)}-01-01`, p_hasta: fecha });
    for (const x of (data ?? []) as { cuenta: string; debe: number; haber: number }[]) if (['2105004', '2202001'].includes(x.cuenta)) saldos[x.cuenta] = Math.max(0, Math.round(Number(x.haber) - Number(x.debe)));
  }
  return { cuentas: cuentas as (CuentaPlan & { nombre: string })[], saldos };
}

export async function contabilizarFiniquito(empresaId: string, id: string, cfg: CfgAsientoFin): Promise<Res> {
  const [f] = await finiquitosDeEmpresa(empresaId, id);
  if (!f) return { ok: false, error: 'El finiquito no existe.' };
  if (f.asiento && !f.asiento.anulado) return { ok: false, error: `Ya está contabilizado en el asiento N° ${f.asiento.numero}.` };
  const c = await calcular(empresaId, f.datos as unknown as FormFiniquito);
  if ('error' in c) return { ok: false, error: c.error! };
  const r = c.r as FiniquitoOk;
  if (Math.round(r.total) !== Math.round(f.total)) return { ok: false, error: `El cálculo cambió desde que se guardó (antes ${clp(f.total)}, ahora ${clp(r.total)}). Abre el finiquito y guárdalo de nuevo.` };
  const { cuentas, saldos } = await datosAsientoFiniquito(empresaId, cfg.fecha);
  const plan = new Map(cuentas.map((x) => [x.codigo, x]));
  const p = propuestaAsiento(c.t.nombre, c.t.rut, r, cfg, plan, saldos);
  if (p.errores.length) return { ok: false, error: p.errores.join(' · ') };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('contabilizar_finiquito', { p_id: id, p_fecha: cfg.fecha, p_glosa: `Finiquito ${c.t.nombre} (${f.fecha_termino.split('-').reverse().join('/')})`,
    p_lineas: p.movs.map(({ cuenta, debe, haber, glosa, rut_auxiliar, centro_costo }) => ({ cuenta, debe, haber, glosa, rut_auxiliar, centro_costo })) });
  if (error) return { ok: false, error: error.message };
  const fila = (Array.isArray(data) ? data[0] : data) as { numero: number } | null;
  revalidatePath(ruta(empresaId), 'layout');
  return { ok: true, mensaje: `Finiquito contabilizado en el asiento N° ${fila?.numero ?? '?'}.` };
}

// ── Plantillas ──
export async function guardarPlantilla(empresaId: string, p: { uuid?: string; codigo?: string; nombre: string; causal: string; texto: string }): Promise<Res> {
  if (!p.nombre.trim()) return { ok: false, error: 'Ponle un nombre a la plantilla.' };
  if (!p.texto.trim()) return { ok: false, error: 'La plantilla no tiene texto.' };
  const supabase = await crearClienteServidor();
  const codigo = p.codigo || `propia-${Date.now().toString(36)}`;
  const fila = { nombre: p.nombre.trim(), causal: p.causal || '', texto: p.texto, actualizado: new Date().toISOString() };
  const { data, error } = p.uuid ? await supabase.from('finiquito_plantillas').update(fila).eq('id', p.uuid).eq('empresa_id', empresaId).select('id')
    : await supabase.from('finiquito_plantillas').insert({ ...fila, empresa_id: empresaId, codigo }).select('id');
  if (error) return { ok: false, error: /duplicate|unique/i.test(error.message) ? 'Esa plantilla ya fue editada: recarga la página.' : error.message };
  if (!data?.length) return { ok: false, error: 'No tienes permiso para este cambio.' };
  revalidatePath(ruta(empresaId), 'layout');
  return { ok: true, mensaje: PLANTILLAS_TIPO.some((x) => x.id === codigo) ? 'Plantilla tipo editada.' : 'Plantilla guardada.' };
}

/** Elimina una plantilla propia o restaura una plantilla tipo a su texto original. */
export async function eliminarPlantilla(empresaId: string, uuid: string): Promise<Res> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from('finiquito_plantillas').delete().eq('id', uuid).eq('empresa_id', empresaId).select('codigo');
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: 'No tienes permiso para este cambio.' };
  revalidatePath(ruta(empresaId), 'layout');
  return { ok: true, mensaje: PLANTILLAS_TIPO.some((x) => x.id === data[0].codigo) ? 'Plantilla tipo restaurada a su texto original.' : 'Plantilla eliminada.' };
}

/** Vista previa del asiento con la configuración elegida (cuentas, centro de costo, provisiones). */
export async function propuestaFiniquito(empresaId: string, id: string, cfg: CfgAsientoFin) {
  const [f] = await finiquitosDeEmpresa(empresaId, id);
  if (!f) return { movs: [], errores: ['El finiquito no existe.'], avisos: [], debe: 0, haber: 0, saldos: {} as Record<string, number> };
  const c = await calcular(empresaId, f.datos as unknown as FormFiniquito);
  if ('error' in c) return { movs: [], errores: [c.error!], avisos: [], debe: 0, haber: 0, saldos: {} as Record<string, number> };
  const { cuentas, saldos } = await datosAsientoFiniquito(empresaId, cfg.fecha);
  const p = propuestaAsiento(c.t.nombre, c.t.rut, c.r as FiniquitoOk, cfg, new Map(cuentas.map((x) => [x.codigo, x])), saldos);
  const nombres = Object.fromEntries(cuentas.map((x) => [x.codigo, x.nombre]));
  return { ...p, movs: p.movs.map((m) => ({ ...m, nombre: nombres[m.cuenta] || '' })), saldos };
}
