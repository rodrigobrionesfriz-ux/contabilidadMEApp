'use server';

import { errorArchivoRCV } from '@/rcv/archivo';
import { revalidatePath } from 'next/cache';
import { crearClienteServidor } from '@/lib/supabase/server';
import { planDeEmpresa } from '@/lib/datos/maestros';
import { PlanCuentas } from '@/motor/plan-cuentas';
import { claveDocumento, origenDocumento, construirRegistro, refDocumento, type Asignacion } from '@/rcv/documento';
import type { DocRCV, FilaDescartada, TipoRCV } from '@/rcv/leer';

export interface ItemRegistro { doc: DocRCV; asignacion: Asignacion }
export interface ResultadoItem { ref: string; ok: boolean; numero?: number; error?: string }

/**
 * Registra documentos (desde el RCV o ingreso manual). El asiento se recalcula aquí con el
 * motor y el plan de cuentas de la base; lo que mande el navegador sólo son datos del documento.
 */
export async function registrarDocumentos(empresaId: string, tipo: TipoRCV, periodo: string, items: ItemRegistro[]): Promise<ResultadoItem[]> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) return items.map((i) => ({ ref: refDocumento(tipo, i.doc), ok: false, error: 'Período no válido' }));
  if (tipo !== 'compra' && tipo !== 'venta') return [];
  if (items.length > 100) throw new Error('Envía como máximo 100 documentos por vez');
  const supabase = await crearClienteServidor();
  const plan = new PlanCuentas(await planDeEmpresa(empresaId));
  const out: ResultadoItem[] = [];
  for (const it of items) {
    const ref = refDocumento(tipo, it.doc);
    const r = construirRegistro(tipo, it.doc, periodo, it.asignacion, plan);
    if (!r.ok) { out.push({ ref, ok: false, error: r.errores.join(' ') }); continue; }
    const { data, error } = await supabase.rpc('registrar_documento', { p_empresa: empresaId, p_doc: r.registro.documento, p_asiento: r.registro.asiento });
    if (error) out.push({ ref, ok: false, error: error.message });
    else out.push({ ref, ok: true, numero: (data as { numero: number }[])[0]?.numero });
  }
  revalidatePath(`/e/${empresaId}`, 'layout');
  return out;
}

export async function anularDocumento(empresaId: string, id: string, motivo: string): Promise<{ error?: string }> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('anular_documento', { p_id: id, p_motivo: motivo });
  if (error) return { error: error.message };
  revalidatePath(`/e/${empresaId}`, 'layout');
  return {};
}

export interface FichaAuxiliar { razonSocial: string; cuenta: string; cc: string; formaPago?: string }

export interface EstadoPrevio {
  /** Claves rut|dte|folio ya registradas (no anuladas) */
  existentes: string[];
  /** Última cuenta y CC usados por RUT (respaldo cuando el auxiliar aún no tiene ficha) */
  ultima: Record<string, { cuenta: string; cc: string; formaPago?: string }>;
  /** Fichas de los auxiliares del archivo (por RUT 12345678-9): cuenta y CC por defecto */
  fichas: Record<string, FichaAuxiliar>;
  /** Dónde quedó cada documento ya registrado (por clave): origen, asiento y fecha */
  registros: Record<string, RegistroPrevio>;
}
export interface RegistroPrevio { origen: string; numero: number | null; fecha: string }

export async function consultarPrevios(empresaId: string, tipo: TipoRCV, ruts: string[]): Promise<EstadoPrevio> {
  const supabase = await crearClienteServidor();
  const unicos = [...new Set(ruts)].slice(0, 2000);
  const existentes: string[] = [];
  const registros: EstadoPrevio['registros'] = {};
  const ultima: EstadoPrevio['ultima'] = {};
  // Los documentos importados pueden traer el id del centro en el sistema anterior: se traduce al código vigente
  const { data: ccs } = await supabase.from('centros_costo').select('codigo,ref_origen').eq('empresa_id', empresaId);
  const codigoCC = new Map<string, string>();
  for (const c of ccs ?? []) { codigoCC.set(c.codigo, c.codigo); if (c.ref_origen) codigoCC.set(c.ref_origen, c.codigo); }
  for (let i = 0; i < unicos.length; i += 150) {
    const { data, error } = await supabase.from('documentos')
      .select('rut,tipo_dte,folio,estado,fecha,ref_origen,origen:datos->>origenRegistro,asiento:asientos(numero),cuenta:datos->dist->0->>cuenta,cc:datos->dist->0->>cc,ingreso:datos->>cuentaIngreso,fp:datos->>formaPago')
      .eq('empresa_id', empresaId).eq('tipo', tipo).in('rut', unicos.slice(i, i + 150))
      .order('fecha', { ascending: false }).limit(1000);
    if (error) throw new Error(error.message);
    for (const d of data as unknown as { rut: string; tipo_dte: number; folio: string; estado: string | null; fecha: string; ref_origen: string | null; origen: string | null; asiento: { numero: number } | null; cuenta: string | null; cc: string | null; ingreso: string | null; fp: string | null }[]) {
      if (d.estado !== 'anulado') {
        const k = claveDocumento(d.rut, d.tipo_dte, d.folio);
        existentes.push(k);
        registros[k] = { origen: origenDocumento(d.ref_origen, d.origen, tipo), numero: d.asiento?.numero ?? null, fecha: String(d.fecha ?? '').slice(0, 10) };
      }
      const cuenta = d.cuenta || d.ingreso;
      if (cuenta && !ultima[d.rut] && d.estado !== 'anulado') ultima[d.rut] = { cuenta, cc: (d.cc && codigoCC.get(d.cc)) || '', ...(d.fp ? { formaPago: d.fp } : {}) };
    }
  }
  const fichas: EstadoPrevio['fichas'] = {};
  const tipoAux = tipo === 'compra' ? 'proveedor' : 'cliente';
  for (let i = 0; i < unicos.length; i += 150) {
    const { data, error } = await supabase.from('auxiliares').select('rut,razon_social,cuenta,centro_costo,forma_pago')
      .eq('empresa_id', empresaId).eq('tipo', tipoAux).in('rut', unicos.slice(i, i + 150));
    if (error) throw new Error(error.message);
    for (const f of data ?? []) fichas[f.rut] = { razonSocial: f.razon_social, cuenta: f.cuenta ?? '', cc: f.centro_costo ?? '', ...(f.forma_pago ? { formaPago: f.forma_pago } : {}) };
  }
  return { existentes, ultima, fichas, registros };
}

export interface OpcionFicha {
  /** Crear la ficha si el auxiliar no tiene (con la cuenta y CC de este asiento) */
  crear: boolean;
  /** Reemplazar la cuenta y CC por defecto de una ficha existente */
  actualizar: boolean;
  razonSocial: string;
}

/**
 * Importa un documento del RCV ya revisado en el paso 2: lo contabiliza (pasa al libro) y, si corresponde,
 * crea o actualiza la ficha del auxiliar con la cuenta y el centro de costo de la primera línea del asiento.
 */
export async function importarDocumento(empresaId: string, tipo: TipoRCV, periodo: string, item: ItemRegistro, ficha: OpcionFicha):
  Promise<ResultadoItem & { ficha?: FichaAuxiliar; avisoFicha?: string }> {
  const [r] = await registrarDocumentos(empresaId, tipo, periodo, [item]);
  if (!r?.ok || (!ficha.crear && !ficha.actualizar)) return r;
  const a = item.asignacion;
  const primera = a.detalle?.lineas.find((l) => !l.otroImp);
  const cuenta = primera?.cuenta ?? a.cuenta ?? '';
  const cc = primera?.cc ?? a.cc ?? '';
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('guardar_auxiliar', {
    p_empresa: empresaId, p_tipo: tipo === 'compra' ? 'proveedor' : 'cliente', p_rut: `${item.doc.rutCodigo}-${item.doc.rutDV}`,
    p_razon_social: ficha.razonSocial.trim() || item.doc.razonSocial, p_cuenta: cuenta, p_cc: cc,
    p_forma_pago: tipo === 'venta' ? (a.formaPago ?? 'clientes') : null, p_solo_crear: !ficha.actualizar,
  });
  // El documento ya quedó registrado: un problema con la ficha sólo se avisa
  if (error) return { ...r, avisoFicha: `El documento quedó registrado, pero no se pudo guardar la ficha: ${error.message}` };
  return { ...r, ficha: { razonSocial: ficha.razonSocial.trim() || item.doc.razonSocial, cuenta, cc, ...(tipo === 'venta' ? { formaPago: a.formaPago ?? 'clientes' } : {}) } };
}

// ─────────────── RCV guardados por período (para retomar en otra sesión) ───────────────

export interface ResumenCarga { periodo: string; archivo: string; total: number; pendientes: number; actualizado: string }
export interface CargaRCV { periodo: string; archivo: string; docs: DocRCV[]; descartadas: FilaDescartada[]; actualizado: string; previos: EstadoPrevio }

const periodoOk = (p: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(p);

export async function resumenCargas(empresaId: string, tipo: TipoRCV): Promise<ResumenCarga[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('rcv_resumen', { p_empresa: empresaId, p_tipo: tipo });
  if (error) throw new Error(error.message);
  return (data ?? []) as ResumenCarga[];
}

/** Guarda lo leído del archivo en el período; si ya había un RCV de ese mes, combina los documentos. */
export async function guardarCarga(empresaId: string, tipo: TipoRCV, periodo: string, archivo: string, docs: DocRCV[], descartadas: FilaDescartada[]):
  Promise<{ ok: true; total: number; nuevos: number } | { ok: false; error: string }> {
  if (tipo !== 'compra' && tipo !== 'venta') return { ok: false, error: 'Tipo no válido' };
  if (!periodoOk(periodo)) return { ok: false, error: 'Período no válido' };
  if (!Array.isArray(docs) || docs.length > 5000) return { ok: false, error: 'El archivo tiene demasiados documentos' };
  const supabase = await crearClienteServidor();
  // El RCV debe ser de esta empresa (el SII pone su RUT en el nombre del archivo)
  const { data: emp } = await supabase.from('empresas').select('rut').eq('id', empresaId).maybeSingle();
  const errArchivo = errorArchivoRCV(archivo, tipo, emp?.rut ?? '');
  if (errArchivo) return { ok: false, error: errArchivo };
  const { data: previa, error: e1 } = await supabase.from('rcv_cargas').select('docs').eq('empresa_id', empresaId).eq('tipo', tipo).eq('periodo', periodo).maybeSingle();
  if (e1) return { ok: false, error: e1.message };
  const porClave = new Map<string, DocRCV>(((previa?.docs ?? []) as DocRCV[]).map((d) => [refDocumento(tipo, d), d]));
  const antes = porClave.size;
  for (const d of docs) porClave.set(refDocumento(tipo, d), d);
  const todos = [...porClave.values()].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.razonSocial.localeCompare(b.razonSocial));
  const { error } = await supabase.from('rcv_cargas').upsert({
    empresa_id: empresaId, tipo, periodo, archivo: archivo.slice(0, 200), docs: todos, descartadas: descartadas.slice(0, 500), actualizado: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/e/${empresaId}/rcv`);
  return { ok: true, total: todos.length, nuevos: todos.length - antes };
}

/** Abre el RCV guardado de un período con lo necesario para el paso 2 (registrados, fichas, último uso). */
export async function abrirCarga(empresaId: string, tipo: TipoRCV, periodo: string): Promise<CargaRCV | null> {
  if (!periodoOk(periodo)) return null;
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from('rcv_cargas').select('periodo,archivo,docs,descartadas,actualizado')
    .eq('empresa_id', empresaId).eq('tipo', tipo).eq('periodo', periodo).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const docs = data.docs as DocRCV[];
  const previos = await consultarPrevios(empresaId, tipo, docs.map((d) => `${d.rutCodigo}-${d.rutDV}`));
  return { periodo: String(data.periodo), archivo: data.archivo, docs, descartadas: (data.descartadas ?? []) as FilaDescartada[], actualizado: data.actualizado, previos };
}

export async function quitarCarga(empresaId: string, tipo: TipoRCV, periodo: string): Promise<{ error?: string }> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from('rcv_cargas').delete().eq('empresa_id', empresaId).eq('tipo', tipo).eq('periodo', periodo);
  if (error) return { error: error.message };
  revalidatePath(`/e/${empresaId}/rcv`);
  return {};
}
