'use server';

import { revalidatePath } from 'next/cache';
import { crearClienteServidor } from '@/lib/supabase/server';
import { entradaF29, asientosF29 } from '@/lib/datos/f29';
import { calcularF29Anual, CODIGOS_DECLARABLES } from '@/tributario/f29';
import { compensacionIVA, pagoF29, CUENTA_REMANENTE, type ConceptoPago } from '@/tributario/asientos-f29';

type Res = { ok: true; mensaje: string } | { ok: false; error: string };
const per = (anio: number, mes: number) => `${anio}-${String(mes).padStart(2, '0')}`;
const ultimoDia = (anio: number, mes: number) => new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);
const limpiar = (d: Record<string, unknown>) => Object.fromEntries(Object.entries(d)
  .filter(([k, v]) => (CODIGOS_DECLARABLES as readonly number[]).includes(+k) && v !== '' && v != null && Number.isFinite(Number(v)))
  .map(([k, v]) => [k, Math.round(Number(v))]));

export async function guardarF29(empresaId: string, anio: number, mes: number, declarado: Record<string, unknown>, utm: number | null, remanenteInicial: number | null): Promise<Res> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('guardar_f29', { p_empresa: empresaId, p_periodo: per(anio, mes), p_declarado: limpiar(declarado), p_utm: utm || 0, p_remanente_inicial: remanenteInicial });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/e/${empresaId}/f29`);
  return { ok: true, mensaje: 'Borrador guardado.' };
}

export async function presentarF29(empresaId: string, anio: number, mes: number, declarado: Record<string, unknown>): Promise<Res> {
  const calc = calcularF29Anual(await entradaF29(empresaId, anio))[mes - 1];
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('presentar_f29', { p_empresa: empresaId, p_periodo: per(anio, mes), p_declarado: limpiar(declarado), p_calculado: calc.codigos });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/e/${empresaId}/f29`);
  return { ok: true, mensaje: 'F29 marcado como presentado. Los meses siguientes arrastran el remanente declarado.' };
}

export async function reabrirF29(empresaId: string, anio: number, mes: number): Promise<Res> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('reabrir_f29', { p_empresa: empresaId, p_periodo: per(anio, mes) });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/e/${empresaId}/f29`);
  return { ok: true, mensaje: 'F29 reabierto.' };
}

async function existente(empresaId: string, anio: number, origen: string) {
  return (await asientosF29(empresaId, anio)).find((a) => a.origen_id === origen && !a.anulado);
}

export async function generarCompensacion(empresaId: string, anio: number, mes: number, incluirPPM: boolean): Promise<Res> {
  const origen = `ivaf29:${per(anio, mes)}`;
  const ya = await existente(empresaId, anio, origen);
  if (ya) return { ok: false, error: `Ya existe la compensación de este mes (asiento N° ${ya.numero}). Anúlala en el libro diario para generarla de nuevo.` };
  const d = calcularF29Anual(await entradaF29(empresaId, anio))[mes - 1];
  const c = compensacionIVA(d, anio, incluirPPM);
  if (!c.lineas.length) return { ok: false, error: 'No hay IVA que compensar en este período.' };
  if (!c.cuadra) return { ok: false, error: 'El asiento de compensación no cuadra.' };
  const supabase = await crearClienteServidor();
  if (c.lineas.some((l) => l.cuenta === CUENTA_REMANENTE.codigo)) {
    const { data } = await supabase.from('cuentas').select('codigo').eq('empresa_id', empresaId).eq('codigo', CUENTA_REMANENTE.codigo).maybeSingle();
    if (!data) {
      const { error } = await supabase.from('cuentas').insert({ empresa_id: empresaId, ...CUENTA_REMANENTE, acepta_movimientos: true });
      if (error) return { ok: false, error: `No se pudo crear la cuenta ${CUENTA_REMANENTE.codigo}: ${error.message}` };
    }
  }
  const { data, error } = await supabase.rpc('crear_asiento', { p_empresa: empresaId, p_fecha: ultimoDia(anio, mes), p_glosa: c.glosa, p_lineas: c.lineas, p_tipo: 'tributario', p_origen_id: origen });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/e/${empresaId}`, 'layout');
  return { ok: true, mensaje: `Compensación registrada en el asiento N° ${(data as { numero: number }[])[0].numero}.` };
}

export async function registrarPagoF29(empresaId: string, anio: number, mes: number, montos: Partial<Record<ConceptoPago, number>>, banco: string, fecha: string): Promise<Res> {
  const origen = `pagof29:${per(anio, mes)}`;
  const ya = await existente(empresaId, anio, origen);
  if (ya) return { ok: false, error: `Ya existe el pago de este F29 (asiento N° ${ya.numero}). Anúlalo en el libro diario para registrarlo de nuevo.` };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, error: 'Fecha no válida' };
  const d = calcularF29Anual(await entradaF29(empresaId, anio))[mes - 1];
  // Si la compensación provisionó el PPM (2105006), el pago salda la provisión
  const supabase = await crearClienteServidor();
  const comp = await existente(empresaId, anio, `ivaf29:${per(anio, mes)}`);
  let cuentaPPM: string | undefined;
  if (comp) {
    const { data } = await supabase.from('asiento_lineas').select('cuenta').eq('asiento_id', comp.id).eq('cuenta', '2105006').limit(1);
    if (data?.length) cuentaPPM = '2105006';
  }
  const p = pagoF29(d, anio, montos, banco, cuentaPPM ? { ppm: cuentaPPM } : {});
  if (!p.total) return { ok: false, error: 'No hay montos que pagar.' };
  const { data, error } = await supabase.rpc('crear_asiento', { p_empresa: empresaId, p_fecha: fecha, p_glosa: p.glosa, p_lineas: p.lineas, p_tipo: 'tributario', p_origen_id: origen });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/e/${empresaId}`, 'layout');
  return { ok: true, mensaje: `Pago del F29 registrado en el asiento N° ${(data as { numero: number }[])[0].numero}.` };
}
