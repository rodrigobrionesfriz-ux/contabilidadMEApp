import 'server-only';
import { crearClienteServidor } from '@/lib/supabase/server';
import { traerTodo } from '@/lib/paginar';
import { aCamel, type BodegaI, type GrupoI, type MovimientoI, type OrdenCompraI, type ProductoI, type RecepcionI, type TomaI } from '@/inventario/filas';
import type { DocCompra } from '@/inventario/motor';

export interface DatosInventario {
  version: number;
  grupos: GrupoI[]; bodegas: BodegaI[]; productos: ProductoI[]; movimientos: MovimientoI[];
  tomas: TomaI[]; ordenes: OrdenCompraI[]; recepciones: RecepcionI[];
}

/** Todo el inventario de la empresa (los saldos se reconstruyen con el motor). */
export async function datosInventario(empresaId: string): Promise<DatosInventario> {
  const supabase = await crearClienteServidor();
  const todo = <T,>(tabla: string, orden: string) => traerTodo((d, h) => supabase.from(tabla).select('*').eq('empresa_id', empresaId).order(orden).range(d, h))
    .then((f) => (f as Record<string, unknown>[]).map((x) => aCamel<T>(x)));
  const [est, grupos, bodegas, productos, movimientos, tomas, ordenes, recepciones] = await Promise.all([
    supabase.from('inv_estado').select('version').eq('empresa_id', empresaId).maybeSingle(),
    todo<GrupoI>('inv_grupos', 'nombre'), todo<BodegaI>('inv_bodegas', 'codigo'), todo<ProductoI>('inv_productos', 'codigo'),
    todo<MovimientoI>('inv_movimientos', 'creado'), todo<TomaI>('inv_tomas', 'creado'), todo<OrdenCompraI>('inv_ordenes_compra', 'creado'), todo<RecepcionI>('inv_recepciones', 'creado'),
  ]);
  return { version: Number(est.data?.version ?? 0), grupos, bodegas, productos, movimientos, tomas, ordenes, recepciones };
}

/** Datos de apoyo: proveedores (desde las compras registradas), facturas para conciliar, centros y cuentas de gasto. */
export async function apoyoInventario(empresaId: string) {
  const supabase = await crearClienteServidor();
  const [compras, centros, cuentas] = await Promise.all([
    traerTodo((d, h) => supabase.from('documentos').select('id,tipo_dte,rut,razon_social,folio,fecha,total,estado').eq('empresa_id', empresaId).eq('tipo', 'compra').order('fecha', { ascending: false }).range(d, h)),
    supabase.from('centros_costo').select('codigo,nombre').eq('empresa_id', empresaId).eq('activo', true).order('codigo'),
    supabase.from('cuentas').select('codigo,nombre').eq('empresa_id', empresaId).like('codigo', '3%').eq('acepta_movimientos', true).eq('activa', true).order('codigo'),
  ]);
  const docs = compras as { id: string; tipo_dte: number; rut: string | null; razon_social: string | null; folio: string; fecha: string; total: number; estado: string | null }[];
  const prov = new Map<string, string>();
  for (const d of docs) if (d.rut && !prov.has(d.rut)) prov.set(d.rut, d.razon_social || d.rut);
  return {
    proveedores: [...prov].map(([rut, nombre]) => ({ rut, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    facturas: docs.filter((d) => [33, 34].includes(Number(d.tipo_dte)) && d.rut).map((d): DocCompra => ({ id: d.id, tipoDTE: Number(d.tipo_dte), rut: d.rut!, folio: String(d.folio), fecha: String(d.fecha).slice(0, 10), total: Number(d.total), estado: d.estado })),
    centros: (centros.data ?? []) as { codigo: string; nombre: string }[],
    cuentasGasto: (cuentas.data ?? []) as { codigo: string; nombre: string }[],
  };
}
