'use server';

import { revalidatePath } from 'next/cache';
import { crearClienteServidor } from '@/lib/supabase/server';
import { lineasDelMes, empresaParaDocumentos } from '@/lib/datos/remuneraciones';
import { validarLibroLRE, textoLRE, nombreArchivoLRE, type Observacion } from '@/remuneraciones/lre';
import { construirPrevired, textoArchivoPrevired, type CfgPrevired } from '@/remuneraciones/previred';

export type ResArchivo = { ok: boolean; nombre: string; texto?: string; errores: Observacion[]; advertencias: Observacion[]; lineas?: number };

/** Valida y arma el CSV del LRE (Mi DT) del mes. Sólo devuelve el texto si no hay errores. */
export async function archivoLRE(empresaId: string, anio: number, mes: number): Promise<ResArchivo> {
  const [{ lineas, trabajadores, guardado, ctx }, emp] = await Promise.all([lineasDelMes(empresaId, anio, mes), empresaParaDocumentos(empresaId)]);
  const perfiles = Object.fromEntries(trabajadores.map((t) => [t.id, (t.lre || {}) as Record<string, unknown>]));
  const v = validarLibroLRE(lineas, ctx.P.patronal, !!guardado, perfiles);
  const nombre = nombreArchivoLRE(emp.rut || '', anio, mes);
  if (!emp.rut) v.errores.push({ trabajador: 'Empresa', campo: 'RUT', msg: 'Falta RUT de la empresa para nombrar el archivo LRE.' });
  if (v.errores.length) return { ok: false, nombre, errores: v.errores, advertencias: v.advertencias };
  return { ok: true, nombre, texto: textoLRE(lineas, ctx.P.patronal, perfiles), errores: [], advertencias: v.advertencias, lineas: lineas.length };
}

/** Valida y arma el archivo de carga masiva Previred del mes. */
export async function archivoPrevired(empresaId: string, anio: number, mes: number): Promise<ResArchivo> {
  const [{ lineas, trabajadores, guardado, ctx, uf: ufMes, previred }, emp] = await Promise.all([
    lineasDelMes(empresaId, anio, mes), empresaParaDocumentos(empresaId)]);
  const r = construirPrevired({ anio, mes, lineas, cerrado: !!guardado, uf: ufMes, trabajadores, eventos: ctx.eventos, patronal: ctx.P.patronal,
    topeAFP_UF: +ctx.P.ind.topeAFP_UF!, rutEmpresa: emp.rut || '', cfg: previred });
  return { ok: r.ok, nombre: r.nombre, texto: r.ok ? textoArchivoPrevired(r) : undefined, errores: r.errores, advertencias: r.advertencias, lineas: r.lineas.length };
}

export async function guardarCfgPrevired(empresaId: string, cfg: CfgPrevired): Promise<{ ok: boolean; error?: string; mensaje?: string }> {
  const codigos: Record<string, string> = {};
  for (const [k, v] of Object.entries(cfg.codigos || {})) {
    if (!/^(afp|salud|ccaf|mutual):[a-z0-9_]+$/.test(k)) return { ok: false, error: `Código "${k}" no válido. Usa tabla:clave, por ejemplo salud:esencial.` };
    if (!/^\d+$/.test(String(v))) return { ok: false, error: `El código de ${k} debe ser numérico.` };
    codigos[k] = String(v);
  }
  const suc = String(cfg.sucursalMutual || '').trim();
  if (suc && !/^\d+$/.test(suc)) return { ok: false, error: 'La sucursal de la mutual debe ser numérica.' };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from('empresa_parametros').upsert({ empresa_id: empresaId, previred: { sucursalMutual: suc, codigos } });
  if (error) return { ok: false, error: /policy/i.test(error.message) ? 'Sólo un administrador puede cambiar la configuración Previred.' : error.message };
  revalidatePath(`/e/${empresaId}/remuneraciones/libro`);
  return { ok: true, mensaje: 'Configuración Previred guardada.' };
}
