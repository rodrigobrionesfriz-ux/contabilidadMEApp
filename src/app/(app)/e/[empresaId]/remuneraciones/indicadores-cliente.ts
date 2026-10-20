'use client';

import { leerIndicadoresAPI } from '@/remuneraciones/indicadores-api';
import { actualizarIndicadoresAPI } from './acciones';

/** Consulta mindicador.cl desde el navegador y, si falla (red, CORS), deja que lo intente el servidor. */
export async function actualizarIndicadores(empresaId: string, anio: number) {
  let datos;
  try { datos = await leerIndicadoresAPI(anio, 15000); } catch { datos = undefined; }
  return actualizarIndicadoresAPI(empresaId, anio, datos);
}
