'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';
import { planDeEmpresa } from '@/lib/datos/maestros';
import { saldosAuxiliar } from '@/lib/datos/auxiliares';
import { PlanCuentas } from '@/motor/plan-cuentas';
import { armarDocumento, folioNormalizado } from '@/rcv/documento';
import { rutParse } from '@/motor/rut';
import { construirBoleta } from '@/honorarios/boleta';
import { docRCVDesde, rutBase, validarDocAux, TIPO_LIBRO, esTipoDoc, type DocAux, type TipoAux } from '@/asientos/documento-auxiliar';

const linea = z.object({
  cuenta: z.string().trim().min(1, 'Falta la cuenta'),
  debe: z.number().int().nonnegative(),
  haber: z.number().int().nonnegative(),
  glosa: z.string().optional(),
  centro_costo: z.string().optional(),
  rut_auxiliar: z.string().optional(),
  tipo_dte: z.number().int().positive().optional(),
  folio: z.string().trim().max(30).optional(),
});

const asiento = z.object({
  empresaId: z.guid(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida'),
  glosa: z.string().trim().min(1, 'Ingresa la glosa'),
  lineas: z.array(linea).min(2, 'El asiento necesita al menos dos líneas'),
});

export type ResultadoAsiento = { ok: true; numero: number } | { ok: false; error: string };

export async function guardarAsiento(entrada: z.input<typeof asiento>): Promise<ResultadoAsiento> {
  const p = asiento.safeParse(entrada);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const supabase = await crearClienteServidor();
  // Toda la validación contable definitiva (cuadratura, cuentas, período, permisos) ocurre en la base.
  const { data, error } = await supabase.rpc('crear_asiento', {
    p_empresa: p.data.empresaId, p_fecha: p.data.fecha, p_glosa: p.data.glosa, p_lineas: p.data.lineas, p_tipo: 'manual',
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/e/${p.data.empresaId}`, 'layout');
  return { ok: true, numero: (data as { numero: number }[])[0].numero };
}

/**
 * Asiento manual que además registra un documento en el libro (compras, ventas u honorarios), con los mismos datos
 * que se capturan del RCV. El documento queda ligado al asiento y la línea del auxiliar lleva RUT, tipo y folio.
 */
export async function guardarAsientoConDocumento(entrada: z.input<typeof asiento> & { doc: { linea: number; tipo: TipoAux; datos: DocAux } }): Promise<ResultadoAsiento> {
  const p = asiento.safeParse(entrada);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const { linea, tipo, datos } = entrada.doc;
  if (!esTipoDoc(tipo)) return { ok: false, error: 'Tipo de auxiliar no válido' };
  const errores = validarDocAux(tipo, { ...datos, modo: 'nuevo' });
  if (errores.length) return { ok: false, error: `Documento: ${errores.join(', ')}.` };
  const lineas = p.data.lineas;
  if (!lineas[linea]) return { ok: false, error: 'Línea del documento no válida' };
  const plan = new PlanCuentas(await planDeEmpresa(p.data.empresaId));
  // Cuenta de contrapartida para el libro (gasto, ingreso o activo): la primera línea que no es del auxiliar ni de impuestos
  const contra = lineas.find((l, i) => i !== linea && !/^(1108|2103|2104)/.test(l.cuenta) && !plan.regla(l.cuenta)?.tipoAuxiliar);
  const rut = rutBase(datos.rut);
  let documento: Record<string, unknown>;
  if (tipo === 'honorario') {
    const b = construirBoleta({ numero: datos.folio, fecha: datos.fecha, rut, nombre: datos.razon, bruto: Math.round(datos.bruto), conRetencion: +datos.tipoDTE === 70,
      cuentaGasto: contra && plan.regla(contra.cuenta)?.aceptaMovimientos ? contra.cuenta : undefined, cc: contra?.centro_costo, glosa: p.data.glosa }, plan);
    if (!b.ok) return { ok: false, error: b.errores.join(' ') };
    documento = { ...b.registro.documento, datos: { ...b.registro.documento.datos, origenRegistro: 'asiento manual' } };
  } else {
    const libro = TIPO_LIBRO[tipo] as 'compra' | 'venta';
    const d = docRCVDesde(tipo, datos);
    const doc = armarDocumento(libro, d, libro === 'compra' ? datos.periodo : datos.fecha.slice(0, 7),
      { cuenta: contra?.cuenta, cc: contra?.centro_costo, glosa: p.data.glosa, fechaVencimiento: d.fechaVencimiento, origen: 'manual' });
    documento = { tipo: libro, ref: String(doc.id), tipo_dte: d.tipoDTE, folio: d.numero, fecha: d.fecha, rut, razon_social: d.razonSocial,
      neto: d.neto, exento: d.exento, iva: d.iva, total: d.total, datos: { ...doc, origenRegistro: 'asiento manual' } };
  }
  const conAux = lineas.map((l, i) => (i === linea ? { ...l, rut_auxiliar: rut, tipo_dte: +datos.tipoDTE, folio: String(datos.folio).trim() } : l));
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('registrar_documento', {
    p_empresa: p.data.empresaId, p_doc: documento, p_asiento: { fecha: p.data.fecha, glosa: p.data.glosa, lineas: conAux },
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/e/${p.data.empresaId}`, 'layout');
  return { ok: true, numero: (data as { numero: number }[])[0].numero };
}

export interface VerificacionDoc {
  /** Ya está en el libro (no se puede registrar de nuevo) */
  registrado: { origen: string; numero: number | null; fecha: string; razon: string | null } | null;
  /** Está en un RCV guardado, aún sin registrar: al registrarlo aquí, el RCV lo verá como «En el libro» */
  enRCV: string | null;
}

/** Validador de duplicados antes de aceptar un documento nuevo en un asiento manual. */
export async function verificarDocumento(empresaId: string, tipo: TipoAux, rut: string, tipoDTE: number, folio: string): Promise<VerificacionDoc> {
  const r = rutParse(rut);
  if (!esTipoDoc(tipo) || !r.valido || !String(folio).trim() || !(tipoDTE > 0)) return { registrado: null, enRCV: null };
  const libro = TIPO_LIBRO[tipo];
  const supabase = await crearClienteServidor();
  const [reg, rcv] = await Promise.all([
    supabase.rpc('documento_registrado', { p_empresa: empresaId, p_tipo: libro, p_rut: `${r.codigo}-${r.dv}`, p_tipo_dte: tipoDTE, p_folio: String(folio) }),
    libro === 'honorario' ? Promise.resolve({ data: [] as { periodo: string; docs: { numero: string }[] }[] })
      : supabase.from('rcv_cargas').select('periodo,docs').eq('empresa_id', empresaId).eq('tipo', libro).contains('docs', [{ rutCodigo: r.codigo, tipoDTE }]),
  ]);
  const f = ((reg.data ?? []) as { asiento_numero: number | null; fecha: string; razon_social: string | null; origen: string }[])[0];
  const fn = folioNormalizado(folio);
  const enRCV = ((rcv.data ?? []) as { periodo: string; docs: { rutCodigo?: string; tipoDTE?: number; numero: string }[] }[])
    .find((c) => c.docs.some((d) => d.rutCodigo === r.codigo && +(d.tipoDTE ?? 0) === tipoDTE && folioNormalizado(d.numero) === fn))?.periodo ?? null;
  return { registrado: f ? { origen: f.origen, numero: f.asiento_numero, fecha: String(f.fecha ?? '').slice(0, 10), razon: f.razon_social } : null, enRCV };
}

export interface DocPendiente { tipo_dte: number; folio: string; saldo: number; fecha: string | null; razon: string }

/** Documentos con saldo de un RUT (para referenciarlos en un pago o abono manual). */
export async function documentosPendientes(empresaId: string, tipo: TipoAux, rut: string, hasta: string): Promise<DocPendiente[]> {
  if (!esTipoDoc(tipo) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return [];
  const r = rutBase(rut);
  const saldos = await saldosAuxiliar(empresaId, tipo, hasta);
  const s = saldos.find((x) => x.rut === r);
  if (!s) return [];
  return s.items.filter((it) => Math.abs(it.saldo) > 0).slice(0, 30)
    .map((it) => ({ tipo_dte: Number(it.tipo_dte), folio: String(it.folio ?? ''), saldo: it.saldo, fecha: it.fecha ?? null, razon: s.razon }));
}

export async function anularAsiento(empresaId: string, id: string, motivo: string): Promise<{ error?: string }> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('anular_asiento', { p_id: id, p_motivo: motivo });
  if (error) return { error: error.message };
  revalidatePath(`/e/${empresaId}/diario`);
  return {};
}

const lineaEdicion = linea.extend({
  tipo_dte: z.string().trim().regex(/^\d{0,3}$/, 'Tipo de documento no válido').optional(),
  folio: z.string().trim().max(30).optional(),
});
const edicion = z.object({
  empresaId: z.guid(),
  id: z.guid(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida'),
  glosa: z.string().trim().min(1, 'Ingresa la glosa'),
  motivo: z.string().trim().max(300).optional(),
  lineas: z.array(lineaEdicion).min(2, 'El asiento necesita al menos dos líneas'),
});

export async function editarAsiento(entrada: z.input<typeof edicion>): Promise<ResultadoAsiento> {
  const p = edicion.safeParse(entrada);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const supabase = await crearClienteServidor();
  // Validación contable definitiva (permisos, período, cuentas, auxiliar, cuadratura) en la base.
  const { data, error } = await supabase.rpc('editar_asiento', {
    p_id: p.data.id, p_fecha: p.data.fecha, p_glosa: p.data.glosa, p_motivo: p.data.motivo || null,
    p_lineas: p.data.lineas.map((l) => ({ ...l, glosa: l.glosa || undefined, centro_costo: l.centro_costo || undefined,
      rut_auxiliar: l.rut_auxiliar || undefined, tipo_dte: l.tipo_dte || undefined, folio: l.folio || undefined })),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/e/${p.data.empresaId}`, 'layout');
  return { ok: true, numero: (data as { numero: number }[])[0].numero };
}
