'use client';

import { leerIndicadoresAPI } from '@/remuneraciones/indicadores-api';
import { actualizarIndicadoresAPI } from './acciones';

/** El servidor consulta sii.cl (o mindicador.cl); si no puede, el navegador intenta mindicador.cl y manda los valores. */
export async function actualizarIndicadores(empresaId: string, anio: number) {
  const r = await actualizarIndicadoresAPI(empresaId, anio);
  if (r.ok || !/No se pudo consultar/.test(r.error ?? '')) return r;
  try { return await actualizarIndicadoresAPI(empresaId, anio, await leerIndicadoresAPI(anio, 10000)); }
  catch { return { ...r, error: `${r.error} Ingrésalos a mano desde sii.cl → Valores y fechas.` }; }
}
