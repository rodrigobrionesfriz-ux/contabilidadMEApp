import 'server-only';
import { crearClienteServidor } from '@/lib/supabase/server';
import { traerTodo } from '@/lib/paginar';
import { saldosDesde, type FilaSuma } from '@/estados/eeff';
import type { Bien } from '@/activo-fijo/depreciacion';
import { calcularF29Anual } from '@/tributario/f29';
import { calcularRenta, normalizarRenta } from '@/tributario/renta';
import { entradaF29 } from './f29';

export interface LineaGasto { id: number; cuenta: string; fecha: string; numero: number; tipo: string; glosa: string; glosa_linea: string | null; debe: number; haber: number }

/** Todo lo que necesita la renta anual de un año: saldos sin el asiento de cierre, decisiones guardadas, fichas de activo fijo y PPM del F29. */
export async function contextoRenta(empresaId: string, anio: number) {
  const supabase = await crearClienteServidor();
  const desde = `${anio}-01-01`, hasta = `${anio}-12-31`;
  const [emp, saldos, guardado, activos, f29] = await Promise.all([
    supabase.from('empresas').select('razon_social,rut,regimen,tasa_renta').eq('id', empresaId).single(),
    supabase.rpc('saldos_periodo', { p_empresa: empresaId, p_desde: desde, p_hasta: hasta, p_excluir_cierre: true }),
    supabase.from('renta_declaraciones').select('datos,actualizado').eq('empresa_id', empresaId).eq('anio', anio).maybeSingle(),
    supabase.from('activos_fijos').select('id,descripcion,categoria,fecha,ficha,estado').eq('empresa_id', empresaId),
    entradaF29(empresaId, anio),
  ]);
  if (emp.error) throw new Error(emp.error.message);
  if (saldos.error) throw new Error(saldos.error.message);
  const filas = (saldos.data ?? []) as FilaSuma[];
  const M = saldosDesde(filas);
  const regimenEmpresa = emp.data.regimen || '14D3';
  const datos = normalizarRenta(guardado.data?.datos, regimenEmpresa);
  // Sin declaración guardada, la tasa parte de la fijada en la ficha de la empresa (si la hay).
  if (!guardado.data && emp.data.tasa_renta != null) datos.tasa = Number(emp.data.tasa_renta);
  const bienes: Bien[] = (activos.data ?? []).map((f) => ({ ...(f.ficha as Bien), id: f.id, desc: f.descripcion, cat: f.categoria, fecha: String(f.fecha).slice(0, 10), estado: f.estado }));
  let ppmF29 = 0;
  try { ppmF29 = calcularF29Anual(f29).reduce((s, m) => s + (m.ppm || 0), 0); } catch { ppmF29 = 0; }
  let lineasMarcadas: LineaGasto[] = [];
  if (datos.lineasRechazadas.length) {
    const ids = new Set(datos.lineasRechazadas.map(Number));
    lineasMarcadas = (await lineasGasto(empresaId, anio, '3')).filter((l) => ids.has(l.id));
    // Una línea anulada o de otro año deja de existir: se descarta de la lista.
    datos.lineasRechazadas = lineasMarcadas.map((l) => l.id);
  }
  const movRechazados = lineasMarcadas.map((l) => ({ cuenta: l.cuenta, debe: l.debe, haber: l.haber }));
  const R = calcularRenta({ anio, M, datos, bienes, ppmF29, movRechazados });
  return {
    empresa: { nombre: emp.data.razon_social as string, rut: emp.data.rut as string, regimen: regimenEmpresa },
    M, filas: filas.map((f) => ({ cuenta: f.cuenta, debe: Number(f.debe), haber: Number(f.haber) })),
    datos, guardadoEn: guardado.data?.actualizado ?? null, bienes, ppmF29, movRechazados, lineasMarcadas, R,
  };
}

/** Líneas vigentes de las cuentas con el prefijo en el año, sin el asiento de cierre. */
export async function lineasGasto(empresaId: string, anio: number, prefijo: string): Promise<LineaGasto[]> {
  const supabase = await crearClienteServidor();
  const filas = await traerTodo((d, h) => supabase.rpc('lineas_cuentas', { p_empresa: empresaId, p_prefijo: prefijo, p_desde: `${anio}-01-01`, p_hasta: `${anio}-12-31` }).range(d, h));
  return (filas as LineaGasto[]).filter((l) => l.tipo !== 'cierre')
    .map((l) => ({ ...l, id: Number(l.id), fecha: String(l.fecha).slice(0, 10), debe: Number(l.debe), haber: Number(l.haber) }));
}
