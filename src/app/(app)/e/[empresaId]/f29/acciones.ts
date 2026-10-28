'use server';

import { revalidatePath } from 'next/cache';
import { crearClienteServidor } from '@/lib/supabase/server';
import { entradaF29, asientosF29 } from '@/lib/datos/f29';
import { calcularF29Anual, CODIGOS_DECLARABLES, montoDeclarado, F29_MANUALES, F29_ANTICIPO, type AjustesF29 } from '@/tributario/f29';
import { compensacionIVA, pagoF29, CUENTA_REMANENTE, type ConceptoPago } from '@/tributario/asientos-f29';

type Res = { ok: true; mensaje: string } | { ok: false; error: string };
const per = (anio: number, mes: number) => `${anio}-${String(mes).padStart(2, '0')}`;
const ultimoDia = (anio: number, mes: number) => new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);
const limpiar = (d: Record<string, unknown>): Record<string, number> => {
  const r: Record<string, number> = {};
  for (const [k, v] of Object.entries(d)) {
    const n = (CODIGOS_DECLARABLES as readonly number[]).includes(+k) ? montoDeclarado(v) : null;
    if (n !== null) r[k] = n;
  }
  return r;
};

export async function guardarF29(empresaId: string, anio: number, mes: number, declarado: Record<string, unknown>, utm: number | null, remanenteInicial: number | null): Promise<Res> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('guardar_f29', { p_empresa: empresaId, p_periodo: per(anio, mes), p_declarado: limpiar(declarado), p_utm: utm || 0, p_remanente_inicial: remanenteInicial });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/e/${empresaId}/f29`);
  return { ok: true, mensaje: 'Borrador guardado.' };
}

export async function presentarF29(empresaId: string, anio: number, mes: number, declarado: Record<string, unknown>): Promise<Res> {
  const calc = calcularF29Anual(await entradaF29(empresaId, anio))[mes - 1];
  // Lo no digitado en "Declarado" se presenta con lo calculado
  const digitado = limpiar(declarado);
  const final: Record<string, number> = { ...Object.fromEntries(CODIGOS_DECLARABLES.map((c) => [String(c), Math.round(calc.codigos[c] ?? 0)])), ...digitado };
  // Los totales siguen a los componentes declarados, salvo que se hayan digitado:
  // 595 = 89 + 62 + 151 + 48; 598 = anticipo imputado (tope 89); 547 = 91 = 595 − 598
  if (digitado['595'] == null) final['595'] = final['89'] + final['62'] + final['151'] + final['48'];
  if (digitado['598'] == null) final['598'] = Math.min(final['543'] ?? 0, final['89']);
  if (digitado['91'] == null) final['91'] = digitado['547'] ?? final['595'] - final['598'];
  if (digitado['547'] == null) final['547'] = final['91'];
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('presentar_f29', { p_empresa: empresaId, p_periodo: per(anio, mes), p_declarado: final, p_calculado: calc.codigos });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/e/${empresaId}/f29`);
  return { ok: true, mensaje: 'F29 marcado como presentado. Ahora genera el asiento de compensación de IVA y luego registra el pago. Los meses siguientes arrastran el remanente declarado.' };
}

/** Ajustes del mes: tasa PPM manual, códigos ingresados a mano y anticipo de cambio de sujeto. Vacío = calculado. */
export async function guardarAjustesF29(empresaId: string, anio: number, mes: number, entrada: {
  tasaPPM: string; manual: Record<string, string>; anticipo: Record<string, string>; remanenteAnticipoInicial: string; tasaGuardada: number | null;
}): Promise<Res> {
  const ajustes: AjustesF29 = {};
  const tasaTxt = String(entrada.tasaPPM ?? '').trim();
  if (tasaTxt !== '') {
    const t = Number(tasaTxt.replace(',', '.'));
    if (!Number.isFinite(t) || t < 0 || t >= 100) return { ok: false, error: 'Tasa PPM no válida' };
    ajustes.tasaPPM = Math.round(t * 1000) / 1000;
    ajustes.tasaPPMManual = true;
  } else if (entrada.tasaGuardada != null) {
    ajustes.tasaPPM = entrada.tasaGuardada; // la congelada al guardar se mantiene
  }
  const montos = <K extends string>(claves: readonly K[], src: Record<string, string>) => {
    const r: Partial<Record<K, number>> = {};
    for (const k of claves) { const n = montoDeclarado(src?.[k]); if (n !== null) r[k] = Math.max(0, n); }
    return r;
  };
  const manual = montos(F29_MANUALES, entrada.manual), anticipo = montos(F29_ANTICIPO, entrada.anticipo);
  if (Object.keys(manual).length) ajustes.manual = manual;
  if (Object.keys(anticipo).length) ajustes.anticipo = anticipo;
  const ini = montoDeclarado(entrada.remanenteAnticipoInicial);
  if (mes === 1 && ini !== null) ajustes.remanenteAnticipoInicial = Math.max(0, ini);
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc('guardar_f29_ajustes', { p_empresa: empresaId, p_periodo: per(anio, mes), p_ajustes: ajustes });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/e/${empresaId}/f29`);
  return { ok: true, mensaje: 'Ajustes aplicados: el F29 de este mes y los siguientes quedaron recalculados.' };
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
