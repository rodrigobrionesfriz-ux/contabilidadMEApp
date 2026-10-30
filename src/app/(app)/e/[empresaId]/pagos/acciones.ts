'use server';

import { revalidatePath } from 'next/cache';
import { crearClienteServidor } from '@/lib/supabase/server';
import { saldosAuxiliar } from '@/lib/datos/auxiliares';
import { construirPago } from '@/auxiliares/pago';
import { claveDoc, type TipoAuxiliar } from '@/auxiliares/saldos';
import { hoyISO } from '@/lib/formato';
import { construirAbonoTarjetas, type DatosAbonoTarjetas } from '@/auxiliares/abono-tarjetas';

export interface PedidoPago { rut: string; tipo_dte: number | null; folio: string; monto: number }

/** Registra un pago/cobro. Los saldos se recalculan aquí: nunca se paga más que el saldo real. */
export async function registrarPago(empresaId: string, tipo: TipoAuxiliar, fecha: string, cuentaPago: string, glosa: string, pedidos: PedidoPago[]):
  Promise<{ ok: true; numero: number; total: number } | { ok: false; error: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, error: 'Fecha no válida' };
  if (!['cliente', 'proveedor', 'honorario'].includes(tipo)) return { ok: false, error: 'Tipo no válido' };
  const saldos = await saldosAuxiliar(empresaId, tipo, fecha > hoyISO() ? fecha : hoyISO());
  const items = new Map(saldos.flatMap((s) => s.items.map((i) => [i.clave, { s, i }] as const)));
  const sel = [];
  for (const p of pedidos) {
    const x = items.get(claveDoc(p.rut, p.tipo_dte, p.folio));
    if (!x) return { ok: false, error: `El documento ${p.tipo_dte} N° ${p.folio} ya no tiene saldo pendiente.` };
    sel.push({ rut: x.s.rut, razon: x.s.razon, item: x.i, monto: p.monto });
  }
  const pg = construirPago(tipo, sel, cuentaPago, glosa);
  if (!pg.ok) return { ok: false, error: pg.errores.join(' ') };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('crear_asiento', { p_empresa: empresaId, p_fecha: fecha, p_glosa: pg.glosa, p_lineas: pg.lineas, p_tipo: 'pago' });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/e/${empresaId}`, 'layout');
  return { ok: true, numero: (data as { numero: number }[])[0].numero, total: pg.total };
}

/** Abono del operador de tarjetas: traspasa a banco lo depositado y rebaja la comisión (proveedor o gasto). */
export async function registrarAbonoTarjetas(empresaId: string, fecha: string, datos: DatosAbonoTarjetas):
  Promise<{ ok: true; numero: number; total: number } | { ok: false; error: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, error: 'Fecha no válida' };
  const ab = construirAbonoTarjetas(datos);
  if (!ab.ok) return { ok: false, error: ab.errores.join(' ') };
  const supabase = await crearClienteServidor();
  // Validación contable definitiva (permisos, período, cuentas, auxiliar, cuadratura) en la base
  const { data, error } = await supabase.rpc('crear_asiento', { p_empresa: empresaId, p_fecha: fecha, p_glosa: ab.glosa, p_lineas: ab.lineas, p_tipo: 'pago', p_origen_id: `tarjetas:${Date.now()}` });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/e/${empresaId}`, 'layout');
  return { ok: true, numero: (data as { numero: number }[])[0].numero, total: ab.total };
}
