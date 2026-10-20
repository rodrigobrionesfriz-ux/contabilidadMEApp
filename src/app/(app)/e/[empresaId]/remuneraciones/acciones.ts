'use server';

import { revalidatePath } from 'next/cache';
import { crearClienteServidor } from '@/lib/supabase/server';
import { contextoRemuneraciones, indicadoresMes, indicadoresTabla } from '@/lib/datos/remuneraciones';
import { leerIndicadoresAPI, datosAPIValidos, type IndicadorAPI } from '@/remuneraciones/indicadores-api';
import { MESES } from '@/lib/formato';
import { liquidacionMes } from '@/remuneraciones/calculo';
import { lineaLibro, totalizar, asientoRemuneraciones, lineaVacia } from '@/remuneraciones/libro';
import { rutParse } from '@/motor/rut';
import type { ParametrosGuardados } from '@/remuneraciones/parametros';

type Res = { ok: true; mensaje: string; id?: string } | { ok: false; error: string };
const base = (e: string) => `/e/${e}/remuneraciones`;

export async function guardarTrabajador(empresaId: string, id: string | null, rut: string, nombre: string, activo: boolean, ficha: Record<string, unknown>): Promise<Res> {
  const r = rutParse(rut);
  if (!r.valido) return { ok: false, error: 'RUT no válido' };
  if (!nombre.trim()) return { ok: false, error: 'Ingresa el nombre' };
  const supabase = await crearClienteServidor();
  const datos = { nombre: nombre.trim(), activo, ficha, actualizado: new Date().toISOString() };
  const q = id
    ? supabase.from('trabajadores').update(datos).eq('id', id).eq('empresa_id', empresaId).select('id')
    : supabase.from('trabajadores').insert({ ...datos, empresa_id: empresaId, rut: `${r.codigo}-${r.dv}` }).select('id');
  const { data, error } = await q;
  if (error) return { ok: false, error: /duplicate|unique/i.test(error.message) ? 'Ya existe un trabajador con ese RUT' : error.message };
  if (!data?.length) return { ok: false, error: 'No tienes permiso para este cambio.' };
  revalidatePath(base(empresaId), 'layout');
  return { ok: true, mensaje: 'Ficha guardada.', id: data[0].id };
}

export async function importarTrabajadores(empresaId: string, filas: { rut: string; nombre: string; ficha: Record<string, unknown>; ref: string }[]): Promise<Res> {
  const supabase = await crearClienteServidor();
  const validas = filas.map((f) => ({ ...f, r: rutParse(f.rut) })).filter((f) => f.r.valido && f.nombre.trim());
  if (!validas.length) return { ok: false, error: 'El respaldo no trae trabajadores con RUT válido.' };
  const { data: existentes } = await supabase.from('trabajadores').select('rut').eq('empresa_id', empresaId);
  const ya = new Set((existentes ?? []).map((e) => e.rut));
  const nuevos = validas.filter((f) => !ya.has(`${f.r.codigo}-${f.r.dv}`));
  if (nuevos.length) {
    const { error } = await supabase.from('trabajadores').insert(nuevos.map((f) => ({
      empresa_id: empresaId, rut: `${f.r.codigo}-${f.r.dv}`, nombre: f.nombre.trim(), ficha: f.ficha, ref_origen: f.ref,
    })));
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath(base(empresaId), 'layout');
  return { ok: true, mensaje: `${nuevos.length} trabajadores importados${validas.length - nuevos.length ? ` · ${validas.length - nuevos.length} ya existían` : ''}.` };
}

export async function guardarEvento(empresaId: string, ev: { id?: string; trabajador_id: string; tipo: string; lic_tipo?: string; desde: string; hasta: string; folio?: string; obs?: string }): Promise<Res> {
  if (!ev.desde || !ev.hasta || ev.hasta < ev.desde) return { ok: false, error: 'Revisa las fechas desde/hasta.' };
  const supabase = await crearClienteServidor();
  const datos = { trabajador_id: ev.trabajador_id, tipo: ev.tipo, lic_tipo: ev.tipo === 'licencia' ? ev.lic_tipo || null : null, desde: ev.desde, hasta: ev.hasta, folio: ev.folio || null, obs: ev.obs || null };
  const { error } = ev.id ? await supabase.from('rem_eventos').update(datos).eq('id', ev.id) : await supabase.from('rem_eventos').insert({ ...datos, empresa_id: empresaId });
  if (error) return { ok: false, error: error.message };
  revalidatePath(base(empresaId), 'layout');
  return { ok: true, mensaje: 'Evento guardado.' };
}

export async function borrarEvento(empresaId: string, id: string): Promise<Res> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from('rem_eventos').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(base(empresaId), 'layout');
  return { ok: true, mensaje: 'Evento eliminado.' };
}

export async function guardarHoras(empresaId: string, periodo: string, trabajadorId: string, horas: number): Promise<Res> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from('rem_horas').upsert({ empresa_id: empresaId, periodo, trabajador_id: trabajadorId, horas });
  if (error) return { ok: false, error: /policy/i.test(error.message) ? 'El libro de ese mes está cerrado.' : error.message };
  revalidatePath(base(empresaId), 'layout');
  return { ok: true, mensaje: 'Horas guardadas.' };
}

export async function guardarAnticipo(empresaId: string, a: { trabajador_id: string; fecha: string; monto: number; motivo: string; mes_desc: string },
  pago?: { cuenta: string }): Promise<Res> {
  if (!(a.monto > 0)) return { ok: false, error: 'El monto debe ser mayor que cero.' };
  const supabase = await crearClienteServidor();
  let asientoId: string | null = null;
  if (pago?.cuenta) {
    const { data: t } = await supabase.from('trabajadores').select('nombre,rut').eq('id', a.trabajador_id).single();
    const { data, error } = await supabase.rpc('crear_asiento', {
      p_empresa: empresaId, p_fecha: a.fecha, p_glosa: `Anticipo de sueldo — ${t?.nombre ?? ''}`, p_tipo: 'anticipo',
      p_lineas: [{ cuenta: '1106001', debe: Math.round(a.monto), glosa: a.motivo || 'Anticipo de sueldo' }, { cuenta: pago.cuenta, haber: Math.round(a.monto), glosa: `Anticipo ${t?.nombre ?? ''}` }],
    });
    if (error) return { ok: false, error: error.message };
    asientoId = (data as { id: string }[])[0].id;
  }
  const { error } = await supabase.from('rem_anticipos').insert({ ...a, monto: Math.round(a.monto), empresa_id: empresaId, asiento_id: asientoId });
  if (error) return { ok: false, error: /policy/i.test(error.message) ? 'El libro de ese mes está cerrado.' : error.message };
  revalidatePath(base(empresaId), 'layout');
  return { ok: true, mensaje: asientoId ? 'Anticipo registrado con su asiento de pago.' : 'Anticipo registrado.' };
}

export async function borrarAnticipo(empresaId: string, id: string): Promise<Res> {
  const supabase = await crearClienteServidor();
  const { data: a } = await supabase.from('rem_anticipos').select('asiento_id').eq('id', id).single();
  const { error } = await supabase.from('rem_anticipos').delete().eq('id', id);
  if (error) return { ok: false, error: /policy/i.test(error.message) ? 'El libro de ese mes está cerrado.' : error.message };
  if (a?.asiento_id) await supabase.rpc('anular_asiento', { p_id: a.asiento_id, p_motivo: 'Anticipo eliminado' });
  revalidatePath(base(empresaId), 'layout');
  return { ok: true, mensaje: 'Anticipo eliminado.' };
}

/** Cierra el libro: recalcula todo en el servidor, guarda la foto y genera el asiento. */
export async function cerrarLibro(empresaId: string, anio: number, mes: number): Promise<Res> {
  const periodo = `${anio}-${String(mes).padStart(2, '0')}`;
  const { ctx, trabajadores, indicadores } = await contextoRemuneraciones(empresaId, anio);
  // Se recalcula todo con la UF del último día del mes de la tabla indicadores (requisito para cerrar).
  const { uf, utm, ufTabla } = indicadoresMes(ctx.P, anio, mes, indicadores);
  if (!ufTabla) return { ok: false, error: `Falta la UF del último día de ${MESES[mes - 1].toLowerCase()} ${anio}. Ingrésala arriba o en Parámetros → UF y UTM por mes.` };
  const lineas = trabajadores.filter((t) => t.activo).map((t) => lineaLibro(t, liquidacionMes(t, uf, utm, anio, mes, ctx), periodo)).filter((l) => !lineaVacia(l));
  if (!lineas.length) return { ok: false, error: 'No hay trabajadores con remuneraciones en el mes.' };
  const tot = totalizar(lineas);
  const a = asientoRemuneraciones(tot, anio, mes);
  if (!a.cuadra) return { ok: false, error: 'El asiento no cuadra.' };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('cerrar_libro_remuneraciones', {
    p_empresa: empresaId, p_periodo: periodo, p_uf: uf, p_utm: utm, p_lineas: lineas, p_totales: tot, p_fecha: a.fecha, p_glosa: a.glosa, p_asiento: a.lineas,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/e/${empresaId}`, 'layout');
  return { ok: true, mensaje: `Libro cerrado: ${lineas.length} trabajadores, asiento N° ${(data as { numero: number }[])[0].numero}.` };
}

/** UF del último día del mes (y UTM) en la tabla común de indicadores. */
export async function guardarIndicador(empresaId: string, periodo: string, uf: number, utm: number | null): Promise<Res> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) return { ok: false, error: 'Período inválido.' };
  if (!(uf >= 10000 && uf <= 100000)) return { ok: false, error: `Revisa la UF (${uf}): está fuera de rango. Usa coma para decimales, por ejemplo 39.383,07.` };
  if (utm != null && !(utm >= 30000 && utm <= 200000)) return { ok: false, error: `Revisa la UTM (${utm}): está fuera de rango.` };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('guardar_indicador', { p_periodo: periodo, p_uf: uf, p_utm: utm });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/e/${empresaId}`, 'layout');
  return { ok: true, mensaje: `UF de ${periodo} guardada. Las liquidaciones del mes se recalcularon con ella.` };
}

/**
 * Guarda la UF del último día de cada mes y la UTM del año desde mindicador.cl. El navegador intenta la consulta
 * primero (desde Vercel la API a veces no responde) y manda los valores; si no, la hace el servidor.
 */
export async function actualizarIndicadoresAPI(empresaId: string, anio: number, desdeNavegador?: unknown): Promise<Res> {
  if (!(anio >= 2000 && anio <= 2100)) return { ok: false, error: 'Año inválido.' };
  let api: IndicadorAPI[];
  if (desdeNavegador !== undefined) {
    const v = datosAPIValidos(anio, desdeNavegador);
    if (!v) return { ok: false, error: 'Los valores recibidos de mindicador.cl no son válidos.' };
    api = v;
  } else {
    try { api = await leerIndicadoresAPI(anio); }
    catch (e) { return { ok: false, error: `No se pudo consultar mindicador.cl (${e instanceof Error && e.name === 'TimeoutError' ? 'no respondió a tiempo' : e instanceof Error ? e.message : String(e)}). Intenta de nuevo más tarde o ingrésalos a mano.` }; }
  }
  if (!api.length) return { ok: false, error: `mindicador.cl aún no tiene valores de ${anio}.` };
  const actuales = await indicadoresTabla(anio);
  const supabase = await crearClienteServidor();
  let n = 0;
  for (const x of api) {
    const a = actuales.find((r) => r.periodo === x.periodo);
    const uf = x.uf != null && x.uf !== a?.uf ? x.uf : null;
    const utm = x.utm != null && x.utm !== a?.utm ? x.utm : null;
    if (uf == null && utm == null) continue;
    const { error } = await supabase.rpc('guardar_indicador', { p_periodo: x.periodo, p_uf: uf, p_utm: utm });
    if (error) return { ok: false, error: `${x.periodo}: ${error.message}` };
    n++;
  }
  revalidatePath(`/e/${empresaId}`, 'layout');
  const conUF = api.filter((x) => x.uf != null).map((x) => x.periodo.slice(5));
  return { ok: true, mensaje: n ? `Actualizado desde mindicador.cl: ${n} ${n === 1 ? 'mes' : 'meses'} (UF al cierre de ${conUF.length} meses). Las liquidaciones abiertas se recalcularon.` : 'Los indicadores ya estaban al día.' };
}

export async function reabrirLibro(empresaId: string, anio: number, mes: number): Promise<Res> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('reabrir_libro_remuneraciones', { p_empresa: empresaId, p_periodo: `${anio}-${String(mes).padStart(2, '0')}` });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/e/${empresaId}`, 'layout');
  return { ok: true, mensaje: 'Libro reabierto. Su asiento quedó anulado.' };
}

export async function guardarParametros(empresaId: string, g: ParametrosGuardados): Promise<Res> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from('empresa_parametros').upsert({ empresa_id: empresaId, indicadores: g.indicadores ?? {}, previsional: g.previsional ?? {}, actualizado: new Date().toISOString() });
  if (error) return { ok: false, error: /policy/i.test(error.message) ? 'Sólo un administrador puede cambiar los parámetros.' : error.message };
  revalidatePath(base(empresaId), 'layout');
  return { ok: true, mensaje: 'Parámetros guardados.' };
}
