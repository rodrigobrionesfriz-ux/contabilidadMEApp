'use server';

import { crearClienteServidor } from '@/lib/supabase/server';
import { requerirEmpresa } from '@/lib/auth';
import { traerTodo } from '@/lib/paginar';

type Hoja = { nombre: string; filas: (string | number | boolean | null)[][] };

/** Toda la información del año en hojas de cálculo (respaldo legible; no es el formato del importador). */
export async function datosExportacion(empresaId: string, anio: number): Promise<{ ok: true; hojas: Hoja[]; nombre: string } | { ok: false; error: string }> {
  try {
    const empresa = await requerirEmpresa(empresaId);
    if (!Number.isInteger(anio)) return { ok: false, error: 'Año inválido.' };
    const supabase = await crearClienteServidor();
    const desde = `${anio}-01-01`, hasta = `${anio}-12-31`;
    const [cuentas, centros, asientos, lineas, docs, trab, activos, productos, bodegas, movs] = await Promise.all([
      traerTodo((d, h) => supabase.from('cuentas').select('codigo,nombre,tipo,naturaleza,acepta_movimientos,acepta_centro_costo,tipo_auxiliar,activa').eq('empresa_id', empresaId).order('codigo').range(d, h)),
      supabase.from('centros_costo').select('codigo,nombre,nivel,padre,activo').eq('empresa_id', empresaId).order('codigo'),
      traerTodo((d, h) => supabase.from('asientos').select('id,numero,fecha,glosa,tipo,origen_id,anulado,motivo_anulacion').eq('empresa_id', empresaId).gte('fecha', desde).lte('fecha', hasta).order('numero').range(d, h)),
      traerTodo((d, h) => supabase.rpc('lineas_libro', { p_empresa: empresaId, p_desde: desde, p_hasta: hasta, p_incluir_anulados: true }).range(d, h)),
      traerTodo((d, h) => supabase.from('documentos').select('tipo,tipo_dte,folio,fecha,periodo,rut,razon_social,neto,exento,iva,total,estado,asiento_id').eq('empresa_id', empresaId).eq('anio', anio).order('fecha').range(d, h)),
      supabase.from('trabajadores').select('rut,nombre,activo,ficha').eq('empresa_id', empresaId).order('nombre'),
      supabase.from('activos_fijos').select('descripcion,categoria,fecha,cuenta_activo,ficha,estado').eq('empresa_id', empresaId).order('fecha'),
      supabase.from('inv_productos').select('codigo,ean,descripcion,tipo,unidad,subgrupo,stock_minimo,cuenta_costo,maneja_lotes,activo').eq('empresa_id', empresaId).order('codigo'),
      supabase.from('inv_bodegas').select('id,codigo,nombre').eq('empresa_id', empresaId),
      traerTodo((d, h) => supabase.from('inv_movimientos').select('folio,tipo,fecha,motivo,bodega_origen_id,bodega_destino_id,documento,estado,lineas').eq('empresa_id', empresaId).gte('fecha', desde).lte('fecha', hasta).order('fecha').range(d, h)),
    ]);
    const asi = new Map((asientos as { id: string; numero: number; fecha: string; glosa: string; tipo: string; anulado: boolean }[]).map((a) => [a.id, a]));
    const nomCta = new Map((cuentas as { codigo: string; nombre: string }[]).map((c) => [c.codigo, c.nombre]));
    const nomBod = new Map((bodegas.data ?? []).map((b) => [b.id, b.codigo]));
    const f10 = (s: unknown) => (s ? String(s).slice(0, 10) : '');
    const hojas: Hoja[] = [
      { nombre: 'Resumen', filas: [['RESPALDO EN EXCEL'], ['Empresa', empresa.razon_social], ['RUT', empresa.rut], ['Año', anio], ['Generado', new Date().toISOString().slice(0, 16).replace('T', ' ')], [], ['Hoja', 'Filas'],
        ['Plan de cuentas', cuentas.length], ['Diario', (lineas as unknown[]).length], ['Documentos', (docs as unknown[]).length], ['Trabajadores', (trab.data ?? []).length], ['Activo fijo', (activos.data ?? []).length], ['Productos', (productos.data ?? []).length], ['Movimientos inventario', (movs as unknown[]).length],
        [], ['Respaldo de lectura: sirve para revisar o archivar. Para volver a cargar datos usa el respaldo del sistema anterior en Configuración → Importar respaldo.']] },
      { nombre: 'Plan de cuentas', filas: [['CÓDIGO', 'NOMBRE', 'TIPO', 'NATURALEZA', 'IMPUTABLE', 'CENTRO DE COSTO', 'AUXILIAR', 'ACTIVA'],
        ...(cuentas as Record<string, unknown>[]).map((c) => [c.codigo, c.nombre, c.tipo, c.naturaleza, c.acepta_movimientos ? 'Sí' : 'No', c.acepta_centro_costo ? 'Sí' : 'No', c.tipo_auxiliar || '', c.activa ? 'Sí' : 'No'] as (string | number)[])] },
      { nombre: 'Diario', filas: [['N°', 'FECHA', 'TIPO', 'GLOSA', 'CUENTA', 'NOMBRE CUENTA', 'DEBE', 'HABER', 'DETALLE', 'CENTRO COSTO', 'RUT', 'DTE', 'FOLIO', 'ANULADO'],
        ...(lineas as Record<string, unknown>[]).map((l) => [Number(l.numero), f10(l.fecha), String(l.tipo), String(l.glosa), String(l.cuenta), String(l.nombre_cuenta || nomCta.get(String(l.cuenta)) || ''), Number(l.debe), Number(l.haber), String(l.glosa_linea || ''), String(l.centro_costo || ''), String(l.rut || ''), (l.tipo_dte as number) ?? '', String(l.folio || ''), l.anulado ? 'Sí' : ''] as (string | number)[])] },
      { nombre: 'Documentos', filas: [['TIPO', 'DTE', 'FOLIO', 'FECHA', 'PERÍODO', 'RUT', 'RAZÓN SOCIAL', 'NETO', 'EXENTO', 'IVA', 'TOTAL', 'ESTADO', 'N° ASIENTO'],
        ...(docs as Record<string, unknown>[]).map((d) => [d.tipo, d.tipo_dte ?? '', d.folio || '', f10(d.fecha), d.periodo || '', d.rut || '', d.razon_social || '', Number(d.neto), Number(d.exento), Number(d.iva), Number(d.total), d.estado || '', asi.get(String(d.asiento_id))?.numero ?? ''] as (string | number)[])] },
      { nombre: 'Centros de costo', filas: [['CÓDIGO', 'NOMBRE', 'NIVEL', 'PADRE', 'ACTIVO'], ...(centros.data ?? []).map((c) => [c.codigo, c.nombre, c.nivel, c.padre || '', c.activo ? 'Sí' : 'No'])] },
      { nombre: 'Trabajadores', filas: [['RUT', 'NOMBRE', 'CARGO', 'SUELDO BASE', 'AFP', 'SALUD', 'ACTIVO'], ...(trab.data ?? []).map((t) => { const f = (t.ficha || {}) as Record<string, unknown>; return [t.rut, t.nombre, String(f.cargo || ''), Number(f.base) || 0, String(f.afp || ''), String(f.salud || ''), t.activo ? 'Sí' : 'No']; })] },
      { nombre: 'Activo fijo', filas: [['DESCRIPCIÓN', 'CATEGORÍA', 'FECHA', 'CUENTA', 'VALOR', 'ESTADO'], ...(activos.data ?? []).map((a) => { const f = (a.ficha || {}) as Record<string, unknown>; return [a.descripcion, a.categoria, f10(a.fecha), a.cuenta_activo, Number(f.valorContable ?? f.valor) || 0, a.estado]; })] },
      { nombre: 'Productos', filas: [['CÓDIGO', 'EAN', 'DESCRIPCIÓN', 'TIPO', 'UNIDAD', 'SUBGRUPO', 'STOCK MÍNIMO', 'CUENTA GASTO', 'LOTES', 'ACTIVO'], ...(productos.data ?? []).map((p) => [p.codigo, p.ean, p.descripcion, p.tipo, p.unidad, p.subgrupo, Number(p.stock_minimo), p.cuenta_costo, p.maneja_lotes ? 'Sí' : 'No', p.activo ? 'Sí' : 'No'])] },
      { nombre: 'Movimientos inventario', filas: [['FOLIO', 'TIPO', 'FECHA', 'MOTIVO', 'ORIGEN', 'DESTINO', 'DOCUMENTO', 'ESTADO', 'PRODUCTO (ID)', 'CANTIDAD', 'COSTO UNITARIO', 'LOTE'],
        ...(movs as Record<string, unknown>[]).flatMap((m) => ((m.lineas as Record<string, unknown>[]) || []).map((l) => [m.folio, m.tipo, f10(m.fecha), m.motivo, nomBod.get(String(m.bodega_origen_id)) || '', nomBod.get(String(m.bodega_destino_id)) || '', m.documento || '', m.estado, String(l.productoId), Number(l.cantidad), Number(l.costoUnitario) || 0, String(l.lote || '')] as (string | number)[]))] },
    ];
    // Los movimientos de inventario guardan el id del producto: se reemplaza por su código
    const { data: pids } = await supabase.from('inv_productos').select('id,codigo').eq('empresa_id', empresaId);
    const cod = new Map((pids ?? []).map((p) => [p.id, p.codigo]));
    for (const f of hojas[8].filas.slice(1)) f[8] = cod.get(String(f[8])) || f[8];
    hojas[8].filas[0][8] = 'PRODUCTO';
    await supabase.rpc('registrar_actividad', { p_empresa: empresaId, p_accion: 'exportar_excel', p_detalle: { anio } });
    return { ok: true, hojas, nombre: `respaldo_${empresa.rut.replace(/[^0-9kK]/g, '')}_${anio}.xlsx` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
