'use server';

import { revalidatePath } from 'next/cache';
import { crearClienteServidor } from '@/lib/supabase/server';
import { contextoContratos } from '@/lib/datos/remuneraciones';
import { validarContrato, filaContrato, csvContratos, gruposPorCargo, nombreArchivoContratos, type FichaContratoDT, type DefaultsContrato } from '@/remuneraciones/contrato-dt';
import { PLANTILLAS_CONTRATO_TIPO, validarPlantilla } from '@/remuneraciones/contrato-trabajo';
import { rutParse } from '@/motor/rut';

type Res = { ok: true; mensaje: string } | { ok: false; error: string };
const ruta = (e: string) => `/e/${e}/remuneraciones`;
const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** Guarda los datos propios del contrato (ficha.contratoDT), conservando la marca de informado. */
export async function guardarDatosDT(empresaId: string, trabajadorId: string, datos: FichaContratoDT): Promise<Res & { faltan?: string[] }> {
  if (datos.rutPrincipal && !rutParse(datos.rutPrincipal).valido) return { ok: false, error: 'El RUT de la empresa principal no es válido.' };
  if (String(datos.funciones || '').length > 300) return { ok: false, error: 'Las funciones admiten como máximo 300 caracteres.' };
  const supabase = await crearClienteServidor();
  const { data: t } = await supabase.from('trabajadores').select('ficha').eq('id', trabajadorId).eq('empresa_id', empresaId).maybeSingle();
  if (!t) return { ok: false, error: 'El trabajador no existe.' };
  const ficha = (t.ficha ?? {}) as Record<string, unknown>;
  const prev = (ficha.contratoDT ?? {}) as FichaContratoDT;
  const contratoDT: FichaContratoDT = { ...prev, ...datos, informado: prev.informado || '' };
  if (!contratoDT.horarioPropio) delete contratoDT.horario;
  const { data, error } = await supabase.from('trabajadores').update({ ficha: { ...ficha, contratoDT }, actualizado: new Date().toISOString() }).eq('id', trabajadorId).select('id');
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: 'No tienes permiso para este cambio.' };
  revalidatePath(ruta(empresaId), 'layout');
  const c = await contextoContratos(empresaId);
  const tr = c.trabajadores.find((x) => x.id === trabajadorId)!;
  const v = validarContrato(tr, c.D);
  return { ok: true, mensaje: v.ok ? 'Datos guardados: listo para informar a la DT.' : `Datos guardados. Faltan ${v.faltan.length} dato(s).`, faltan: v.faltan };
}

export async function guardarDefaultsContrato(empresaId: string, d: DefaultsContrato): Promise<Res> {
  const supabase = await crearClienteServidor();
  const defaults: DefaultsContrato = { ...d, diaPago: Math.min(30, Math.max(1, +(d.diaPago || 30))) };
  const { error } = await supabase.from('contrato_config').upsert({ empresa_id: empresaId, defaults, actualizado: new Date().toISOString() });
  if (error) return { ok: false, error: /policy/i.test(error.message) ? 'No tienes permiso para este cambio.' : error.message };
  revalidatePath(ruta(empresaId), 'layout');
  return { ok: true, mensaje: 'Valores por defecto guardados.' };
}

export async function marcarInformados(empresaId: string, ids: string[], informado: boolean): Promise<Res> {
  const supabase = await crearClienteServidor();
  const { data: filas } = await supabase.from('trabajadores').select('id,ficha').eq('empresa_id', empresaId).in('id', ids);
  for (const f of filas ?? []) {
    const ficha = (f.ficha ?? {}) as Record<string, unknown>;
    const contratoDT = { ...((ficha.contratoDT ?? {}) as FichaContratoDT), informado: informado ? hoy() : '' };
    const { error } = await supabase.from('trabajadores').update({ ficha: { ...ficha, contratoDT } }).eq('id', f.id);
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath(ruta(empresaId), 'layout');
  return { ok: true, mensaje: informado ? `${ids.length} contrato(s) marcado(s) como informado(s) a la DT.` : 'Contrato vuelto a pendiente.' };
}

/** CSV de carga masiva (uno por cargo). No genera nada si a algún trabajador le faltan datos. */
export async function archivosContratosDT(empresaId: string, ids: string[]) {
  const c = await contextoContratos(empresaId);
  const trabs = c.trabajadores.filter((t) => ids.includes(t.id));
  if (!trabs.length) return { ok: false as const, error: 'Selecciona al menos un trabajador.', faltan: [], archivos: [], avisos: [] };
  if (trabs.length > 1000) return { ok: false as const, error: 'La DT acepta hasta 1.000 contratos por archivo.', faltan: [], archivos: [], avisos: [] };
  const faltan: { trabajador: string; faltan: string[] }[] = [], avisos: string[] = [];
  for (const t of trabs) { const v = validarContrato(t, c.D); if (!v.ok) faltan.push({ trabajador: t.nombre, faltan: v.faltan }); v.avisos.forEach((a) => avisos.push(`${t.nombre}: ${a}`)); }
  if (!c.empresa.rut) return { ok: false as const, error: 'Falta el RUT de la empresa.', faltan, archivos: [], avisos };
  if (faltan.length) return { ok: false as const, error: `A ${faltan.length} trabajador(es) les faltan datos.`, faltan, archivos: [], avisos };
  const archivos = gruposPorCargo(trabs).map((g) => ({ cargo: g.cargo, n: g.lista.length, nombre: nombreArchivoContratos(c.empresa.rut || '', new Date(), g.sufijo), texto: csvContratos(g.lista.map((t) => filaContrato(t, c.D, c.imponible(t)))) }));
  return { ok: true as const, archivos, faltan, avisos, error: '' };
}

export async function guardarContratoTrabajador(empresaId: string, trabajadorId: string, plantilla: string | null, texto: string | null): Promise<Res> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from('contratos_trabajo').upsert({ empresa_id: empresaId, trabajador_id: trabajadorId, plantilla, texto: texto && texto.trim() ? texto : null, actualizado: new Date().toISOString() });
  if (error) return { ok: false, error: error.message };
  revalidatePath(ruta(empresaId), 'layout');
  return { ok: true, mensaje: texto && texto.trim() ? 'Texto propio del contrato guardado.' : 'Plantilla del contrato guardada.' };
}

export async function guardarPlantillaContrato(empresaId: string, p: { uuid?: string; codigo?: string; nombre: string; cargos: string; tipoContrato: number | ''; texto: string; original?: string | null }): Promise<Res> {
  if (!p.nombre.trim()) return { ok: false, error: 'Ponle un nombre a la plantilla.' };
  const v = validarPlantilla(p.texto, p.original);
  if (!v.ok) return { ok: false, error: v.errores.join(' · ') };
  const supabase = await crearClienteServidor();
  const codigo = p.codigo || `propia-${Date.now().toString(36)}`;
  const fila = { nombre: p.nombre.trim(), cargos: p.cargos.trim(), tipo_contrato: p.tipoContrato || null, texto: p.texto, actualizado: new Date().toISOString() };
  const { data, error } = p.uuid ? await supabase.from('contrato_plantillas').update(fila).eq('id', p.uuid).eq('empresa_id', empresaId).select('id')
    : await supabase.from('contrato_plantillas').insert({ ...fila, empresa_id: empresaId, codigo }).select('id');
  if (error) return { ok: false, error: /duplicate|unique/i.test(error.message) ? 'Esa plantilla ya fue editada: recarga la página.' : error.message };
  if (!data?.length) return { ok: false, error: 'No tienes permiso para este cambio.' };
  revalidatePath(ruta(empresaId), 'layout');
  return { ok: true, mensaje: PLANTILLAS_CONTRATO_TIPO.some((x) => x.id === codigo) ? 'Plantilla tipo editada.' : 'Plantilla guardada.' };
}

export async function eliminarPlantillaContrato(empresaId: string, uuid: string): Promise<Res> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from('contrato_plantillas').delete().eq('id', uuid).eq('empresa_id', empresaId).select('codigo');
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: 'No tienes permiso para este cambio.' };
  revalidatePath(ruta(empresaId), 'layout');
  return { ok: true, mensaje: PLANTILLAS_CONTRATO_TIPO.some((x) => x.id === data[0].codigo) ? 'Plantilla tipo restaurada a su texto original.' : 'Plantilla eliminada.' };
}
