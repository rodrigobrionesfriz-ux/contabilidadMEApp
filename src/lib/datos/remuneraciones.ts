import 'server-only';
import { crearClienteServidor } from '@/lib/supabase/server';
import { traerTodo } from '@/lib/paginar';
import { parametrosVigentes, type ParametrosGuardados, type Parametros } from '@/remuneraciones/parametros';
import { liquidacionMes, calcularLiquidacion, type ContextoRem, type EventoAsistencia, type LibrosRem, type Trabajador } from '@/remuneraciones/calculo';
import { lineaLibro, lineaVacia, totalizar, type LineaLibro, type Totales } from '@/remuneraciones/libro';
import { UTM_SII } from '@/tributario/utm';
import type { CfgFeriados } from '@/remuneraciones/vacaciones';
import type { CfgPrevired } from '@/remuneraciones/previred';
import type { DatosEmpresaDoc, PlantillaGuardada } from '@/remuneraciones/finiquito';
import { defaultsEmpresa, type DefaultsContrato } from '@/remuneraciones/contrato-dt';
import type { EmpresaDocContrato, PlantillaContratoGuardada } from '@/remuneraciones/contrato-trabajo';

export interface FilaTrabajador { id: string; rut: string; nombre: string; activo: boolean; ficha: Record<string, unknown> }
export interface LibroGuardado { periodo: string; uf: number; utm: number; lineas: unknown[]; totales: Record<string, number>; asiento_id: string | null; cerrado_en: string }

export async function parametrosDeEmpresa(empresaId: string): Promise<{ P: Parametros; guardados: ParametrosGuardados; feriados: CfgFeriados; previred: CfgPrevired }> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from('empresa_parametros').select('indicadores,previsional,feriados,previred').eq('empresa_id', empresaId).maybeSingle();
  const guardados: ParametrosGuardados = { indicadores: data?.indicadores ?? {}, previsional: data?.previsional ?? {} };
  const f = (data?.feriados ?? {}) as Partial<CfgFeriados>;
  const feriados: CfgFeriados = { extra: Array.isArray(f.extra) ? f.extra : [], quitar: Array.isArray(f.quitar) ? f.quitar : [] };
  return { P: parametrosVigentes(guardados), guardados, feriados, previred: (data?.previred ?? {}) as CfgPrevired };
}

/** Vacaciones de todos los años (el saldo se calcula desde el inicio del contrato). */
export async function eventosVacaciones(empresaId: string): Promise<EventoAsistencia[]> {
  const supabase = await crearClienteServidor();
  const filas = await traerTodo((d, h) => supabase.from('rem_eventos').select('id,trabajador_id,tipo,desde,hasta,obs')
    .eq('empresa_id', empresaId).eq('tipo', 'vacaciones').order('desde').range(d, h));
  return (filas as { id: string; trabajador_id: string; tipo: string; desde: string; hasta: string; obs: string | null }[])
    .map((e) => ({ id: e.id, trab: e.trabajador_id, tipo: e.tipo, desde: String(e.desde).slice(0, 10), hasta: String(e.hasta).slice(0, 10), obs: e.obs ?? undefined }));
}

/** Eventos del año + vacaciones de años anteriores, sin repetir. */
export const unirEventos = (delAnio: EventoAsistencia[], vac: EventoAsistencia[]) => [...delAnio, ...vac.filter((v) => !delAnio.some((e) => e.id === v.id))];

export async function empresaParaDocumentos(empresaId: string): Promise<DatosEmpresaDoc> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from('empresas').select('rut,razon_social,domicilio,comuna,ciudad,representante,rut_representante').eq('id', empresaId).maybeSingle();
  return { nombre: data?.razon_social ?? '', rut: data?.rut ?? '', domicilio: data?.domicilio ?? '', comuna: data?.comuna ?? '', ciudad: data?.ciudad ?? '', rep: data?.representante ?? '', rutrep: data?.rut_representante ?? '' };
}

/** Trabajadores (con sus anticipos) y todo lo que necesita el cálculo del año. */
export async function contextoRemuneraciones(empresaId: string, anio: number) {
  const supabase = await crearClienteServidor();
  const [par, filas, eventos, horas, anticipos, libros] = await Promise.all([
    parametrosDeEmpresa(empresaId),
    traerTodo((d, h) => supabase.from('trabajadores').select('id,rut,nombre,activo,ficha').eq('empresa_id', empresaId).order('nombre').range(d, h)),
    traerTodo((d, h) => supabase.from('rem_eventos').select('id,trabajador_id,tipo,lic_tipo,desde,hasta,folio,obs')
      .eq('empresa_id', empresaId).lte('desde', `${anio}-12-31`).gte('hasta', `${anio}-01-01`).order('desde').range(d, h)),
    traerTodo((d, h) => supabase.from('rem_horas').select('periodo,trabajador_id,horas').eq('empresa_id', empresaId).like('periodo', `${anio}-%`).range(d, h)),
    traerTodo((d, h) => supabase.from('rem_anticipos').select('id,trabajador_id,fecha,monto,motivo,mes_desc,asiento_id')
      .eq('empresa_id', empresaId).gte('mes_desc', `${anio}-01`).lte('mes_desc', `${anio}-12`).order('fecha').range(d, h)),
    traerTodo((d, h) => supabase.from('libros_remuneraciones').select('periodo,uf,utm,lineas,totales,asiento_id,cerrado_en')
      .eq('empresa_id', empresaId).gte('periodo', `${anio - 1}-07`).lte('periodo', `${anio}-12`).range(d, h)),
  ]);
  const indicadores = await indicadoresTabla(anio);
  const P = par.P;
  const ants = anticipos as { id: string; trabajador_id: string; fecha: string; monto: number; motivo: string | null; mes_desc: string; asiento_id: string | null }[];
  const trabajadores: (Trabajador & { activo: boolean })[] = (filas as FilaTrabajador[]).map((f) => ({
    ...(f.ficha as object), id: f.id, rut: f.rut, nombre: f.nombre, activo: f.activo,
    anticipos: ants.filter((a) => a.trabajador_id === f.id).map((a) => ({ id: a.id, fecha: a.fecha, monto: Number(a.monto), motivo: a.motivo ?? '', mesDesc: a.mes_desc })),
  }) as Trabajador & { activo: boolean });
  const horasMap: ContextoRem['horas'] = {};
  for (const h of horas as { periodo: string; trabajador_id: string; horas: number }[]) (horasMap[h.periodo] ??= {})[h.trabajador_id] = Number(h.horas);
  const librosMap: LibrosRem = {};
  for (const l of libros as LibroGuardado[]) librosMap[l.periodo] = { lineas: l.lineas as { id: string; totalImponible?: number }[] };
  const ctx: ContextoRem = {
    P,
    eventos: (eventos as { id: string; trabajador_id: string; tipo: string; lic_tipo: string | null; desde: string; hasta: string; folio: string | null; obs: string | null }[])
      .map((e): EventoAsistencia => ({ id: e.id, trab: e.trabajador_id, tipo: e.tipo, licTipo: e.lic_tipo ?? undefined, desde: String(e.desde).slice(0, 10), hasta: String(e.hasta).slice(0, 10), folio: e.folio ?? undefined, obs: e.obs ?? undefined })),
    horas: horasMap,
    libros: librosMap,
  };
  return { ctx, trabajadores, anticipos: ants, libros: libros as LibroGuardado[], feriados: par.feriados, previred: par.previred, indicadores };
}

export interface IndicadorFila { periodo: string; uf: number | null; utm: number | null; actualizado: string }

/** UF (último día del mes) y UTM ingresadas a mano en la tabla indicadores, de un año. */
export async function indicadoresTabla(anio: number): Promise<IndicadorFila[]> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from('indicadores').select('periodo,uf,utm,actualizado').gte('periodo', `${anio}-01`).lte('periodo', `${anio}-12`).order('periodo');
  return ((data ?? []) as IndicadorFila[]).map((r) => ({ ...r, uf: r.uf == null ? null : Number(r.uf), utm: r.utm == null ? null : Number(r.utm) }));
}

/**
 * UF y UTM de un mes. UF: la del último día del mes en la tabla indicadores; si falta, la de referencia de los
 * parámetros (ufTabla = false, el libro no se puede cerrar). UTM: la de la tabla, la del SII o la del parámetro.
 */
export function indicadoresMes(P: Parametros, anio: number, mes: number, tabla: IndicadorFila[] = []) {
  const per = `${anio}-${String(mes).padStart(2, '0')}`;
  const fila = tabla.find((r) => r.periodo === per);
  const ufTabla = !!(fila?.uf && fila.uf > 0);
  return { uf: ufTabla ? fila!.uf! : +P.ind.uf, utm: fila?.utm || +(UTM_SII[anio]?.[mes - 1] ?? 0) || +P.ind.utm, ufTabla };
}

/** Líneas del libro de un mes: la foto si está cerrado; si no, el cálculo con las fichas vigentes. */
export async function lineasDelMes(empresaId: string, anio: number, mes: number) {
  const base = await contextoRemuneraciones(empresaId, anio);
  const { ctx, trabajadores, libros } = base;
  const periodo = `${anio}-${String(mes).padStart(2, '0')}`;
  const guardado = libros.find((l) => l.periodo === periodo);
  const def = indicadoresMes(ctx.P, anio, mes, base.indicadores);
  const uf = guardado ? Number(guardado.uf) : def.uf;
  const utm = guardado ? Number(guardado.utm) : def.utm;
  const lineas: LineaLibro[] = guardado ? (guardado.lineas as LineaLibro[])
    : trabajadores.filter((t) => t.activo).map((t) => lineaLibro(t, liquidacionMes(t, uf, utm, anio, mes, ctx), periodo)).filter((l) => !lineaVacia(l));
  const totales = guardado ? (guardado.totales as Totales) : totalizar(lineas);
  return { ...base, periodo, guardado, uf, utm, ufTabla: def.ufTabla, ufIndicador: base.indicadores.find((r) => r.periodo === periodo)?.uf ?? null, lineas, totales };
}

/** Todo lo que necesita el cálculo de un finiquito con término en `anio`. */
export async function contextoFiniquitos(empresaId: string, anio: number) {
  const [base, vac] = await Promise.all([contextoRemuneraciones(empresaId, anio), eventosVacaciones(empresaId)]);
  const ctx: ContextoRem = { ...base.ctx, eventos: unirEventos(base.ctx.eventos, vac) };
  return { ...base, ctx };
}

export interface FilaFiniquito {
  id: string; trabajador_id: string; fecha_termino: string; causal: string; datos: Record<string, unknown>; calc: Record<string, unknown>;
  total: number; texto: string | null; estado: 'borrador' | 'ratificado'; ratificado_en: string | null; asiento_id: string | null; creado: string;
  asiento?: { numero: number; fecha: string; anulado: boolean } | null;
}
export async function finiquitosDeEmpresa(empresaId: string, id?: string): Promise<FilaFiniquito[]> {
  const supabase = await crearClienteServidor();
  let q = supabase.from('finiquitos').select('id,trabajador_id,fecha_termino,causal,datos,calc,total,texto,estado,ratificado_en,asiento_id,creado,asientos(numero,fecha,anulado)').eq('empresa_id', empresaId);
  if (id) q = q.eq('id', id);
  const { data, error } = await q.order('fecha_termino', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((f) => ({ ...f, fecha_termino: String(f.fecha_termino).slice(0, 10), total: Number(f.total), asiento: (Array.isArray(f.asientos) ? f.asientos[0] : f.asientos) ?? null })) as FilaFiniquito[];
}

export async function plantillasFiniquito(empresaId: string): Promise<PlantillaGuardada[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from('finiquito_plantillas').select('id,codigo,nombre,causal,texto').eq('empresa_id', empresaId).order('nombre');
  if (error) throw new Error(error.message);
  return data as PlantillaGuardada[];
}

export async function centrosDeEmpresaLista(empresaId: string): Promise<{ codigo: string; nombre: string }[]> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from('centros_costo').select('codigo,nombre').eq('empresa_id', empresaId).eq('activo', true).order('nombre');
  return data ?? [];
}

/** Trabajadores, valores por defecto, plantillas y contratos guardados para la pestaña Contratos. */
export async function contextoContratos(empresaId: string) {
  const supabase = await crearClienteServidor();
  const anio = new Date().getFullYear();
  const [base, cfg, pls, items, emp] = await Promise.all([
    contextoRemuneraciones(empresaId, anio),
    supabase.from('contrato_config').select('defaults').eq('empresa_id', empresaId).maybeSingle(),
    supabase.from('contrato_plantillas').select('id,codigo,nombre,cargos,tipo_contrato,texto').eq('empresa_id', empresaId).order('nombre'),
    supabase.from('contratos_trabajo').select('trabajador_id,plantilla,texto').eq('empresa_id', empresaId),
    supabase.from('empresas').select('rut,razon_social,giro,domicilio,comuna,ciudad,representante,rut_representante').eq('id', empresaId).maybeSingle(),
  ]);
  const e = emp.data;
  const empresa: EmpresaDocContrato = { nombre: e?.razon_social ?? '', rut: e?.rut ?? '', giro: e?.giro ?? '', domicilio: e?.domicilio ?? '', comuna: e?.comuna ?? '', ciudad: e?.ciudad ?? '', rep: e?.representante ?? '', rutrep: e?.rut_representante ?? '' };
  const cfgDefaults = (cfg.data?.defaults ?? {}) as DefaultsContrato;
  const D = defaultsEmpresa(empresa, cfgDefaults);
  const { P, libros } = base.ctx;
  const ind = indicadoresMes(P, anio, new Date().getMonth() + 1, base.indicadores);
  const imponible = (t: Trabajador) => { try { return calcularLiquidacion(t, ind.uf, ind.utm, undefined, P, libros).totalImponible as number; } catch { return +(t.base || 0); } };
  return {
    ...base, empresa, cfgDefaults, D, imponible,
    plantillasGuardadas: (pls.data ?? []) as PlantillaContratoGuardada[],
    contratos: new Map(((items.data ?? []) as { trabajador_id: string; plantilla: string | null; texto: string | null }[]).map((x) => [x.trabajador_id, x])),
  };
}
