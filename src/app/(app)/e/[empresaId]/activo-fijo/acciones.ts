'use server';

import { revalidatePath } from 'next/cache';
import { crearClienteServidor } from '@/lib/supabase/server';
import { afCat, asientoDepreciacion, type Bien } from '@/activo-fijo/depreciacion';
import { clp } from '@/lib/formato';

type Res = { ok: true; mensaje: string } | { ok: false; error: string };
const ruta = (e: string) => `/e/${e}/activo-fijo`;
const esFecha = (s: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

export interface FormActivo {
  descripcion: string; categoria: string; fecha: string; documentoId: string | null;
  valor: number; residual: number; vidaContable: number; metodoContable: string; fechaInicioDepContable: string;
  valorTributario: number; residualTributario: number; vidaTributaria: number; metodoTributario: string; fechaInicioDepTributaria: string;
}

export async function guardarActivo(empresaId: string, id: string | null, f: FormActivo): Promise<Res> {
  if (!f.descripcion.trim()) return { ok: false, error: 'Ingresa la descripción del bien.' };
  if (!esFecha(f.fecha)) return { ok: false, error: 'Ingresa la fecha de compra.' };
  if (!(f.valor > 0)) return { ok: false, error: 'El valor debe ser mayor a 0.' };
  if (!(f.vidaContable > 0) || !(f.vidaTributaria > 0)) return { ok: false, error: 'Las vidas útiles contable y tributaria deben ser mayores a 0.' };
  if (f.residual >= f.valor) return { ok: false, error: 'El valor residual contable no puede ser mayor o igual al valor.' };
  const vt = f.valorTributario || f.valor;
  if (!(vt > 0) || f.residualTributario >= vt) return { ok: false, error: 'Revisa la base y el residual tributarios.' };
  const c = afCat(f.categoria);
  const ficha: Bien = {
    cat: c.k, fecha: f.fecha, valor: f.valor, residual: f.residual,
    valorContable: f.valor, residualContable: f.residual, vidaContable: f.vidaContable, metodoContable: f.metodoContable, fechaInicioDepContable: f.fechaInicioDepContable || f.fecha,
    valorTributario: vt, residualTributario: f.residualTributario, vidaTributaria: f.vidaTributaria, metodoTributario: f.metodoTributario, fechaInicioDepTributaria: f.fechaInicioDepTributaria || f.fecha,
    vida: f.vidaTributaria, metodo: f.metodoTributario,
  };
  const fila = { descripcion: f.descripcion.trim(), categoria: c.k, fecha: f.fecha, cuenta_activo: c.activo, cuenta_depr_acum: c.deprAcum, cuenta_gasto: c.gasto, ficha, documento_id: f.documentoId || null, actualizado: new Date().toISOString() };
  const supabase = await crearClienteServidor();
  const { data, error } = id ? await supabase.from('activos_fijos').update(fila).eq('id', id).eq('empresa_id', empresaId).select('id')
    : await supabase.from('activos_fijos').insert({ ...fila, empresa_id: empresaId }).select('id');
  if (error) return { ok: false, error: /foreign key/i.test(error.message) ? 'Faltan en el plan de cuentas las cuentas de esta categoría.' : error.message };
  if (!data?.length) return { ok: false, error: 'No tienes permiso para este cambio.' };
  revalidatePath(ruta(empresaId));
  return { ok: true, mensaje: id ? 'Activo actualizado.' : 'Activo registrado.' };
}

export async function eliminarActivo(empresaId: string, id: string): Promise<Res> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from('activos_fijos').delete().eq('id', id).eq('empresa_id', empresaId).select('id');
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: 'No tienes permiso para eliminarlo.' };
  revalidatePath(ruta(empresaId));
  return { ok: true, mensaje: 'Activo eliminado. La depreciación ya contabilizada no cambia.' };
}

/** Asiento de depreciación del año (único por año; se recalcula en el servidor). */
export async function contabilizarDepreciacion(empresaId: string, anio: number): Promise<Res> {
  const supabase = await crearClienteServidor();
  const { data: filas } = await supabase.from('activos_fijos').select('id,descripcion,categoria,fecha,cuenta_depr_acum,cuenta_gasto,ficha,estado').eq('empresa_id', empresaId);
  const bienes = (filas ?? []).map((f) => ({ ...(f.ficha as Bien), id: f.id, desc: f.descripcion, cat: f.categoria, fecha: String(f.fecha).slice(0, 10), estado: f.estado, cuentaGasto: f.cuenta_gasto, cuentaDeprAcum: f.cuenta_depr_acum }));
  const a = asientoDepreciacion(bienes, anio);
  if (a.total <= 0) return { ok: false, error: `No hay depreciación que registrar en ${anio}.` };
  const { data, error } = await supabase.rpc('crear_asiento', { p_empresa: empresaId, p_fecha: a.fecha, p_glosa: a.glosa, p_lineas: a.lineas, p_tipo: 'depreciacion', p_origen_id: `dep:${anio}` });
  if (error) return { ok: false, error: /duplicate|unique|asientos_depreciacion_unica/i.test(error.message) ? `Ya hay un asiento de depreciación vigente para ${anio}. Anúlalo en el libro diario para regenerarlo.` : error.message };
  revalidatePath(`/e/${empresaId}`, 'layout');
  return { ok: true, mensaje: `Asiento N° ${(Array.isArray(data) ? data[0] : data)?.numero} de depreciación ${anio} por ${clp(a.total)} (${a.detalle.length} bien(es)).` };
}
