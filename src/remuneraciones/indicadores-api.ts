// Lectura de UF y UTM desde mindicador.cl (API libre, datos del Banco Central y SII).
// /api/uf/AAAA trae la UF de cada día; /api/utm/AAAA, la UTM de cada mes. Las fechas vienen en UTC a la
// medianoche de Chile (03:00Z o 04:00Z), así que los 10 primeros caracteres son el día chileno.

export const API_INDICADORES = 'https://mindicador.cl/api';

export interface SerieAPI { serie?: { fecha: string; valor: number }[] }
export interface IndicadorAPI { periodo: string; uf: number | null; utm: number | null }

/** Por mes del año: UF del último día del mes y UTM del mes (null si la API aún no la publica). */
export function indicadoresDesdeAPI(anio: number, uf: SerieAPI, utm: SerieAPI): IndicadorAPI[] {
  const dias = new Map((uf.serie ?? []).map((x) => [String(x.fecha).slice(0, 10), +x.valor]));
  const meses = new Map((utm.serie ?? []).map((x) => [String(x.fecha).slice(0, 7), +x.valor]));
  return Array.from({ length: 12 }, (_, i) => {
    const mm = String(i + 1).padStart(2, '0');
    const ultimo = `${anio}-${mm}-${String(new Date(anio, i + 1, 0).getDate()).padStart(2, '0')}`;
    const vUF = dias.get(ultimo);
    const vUTM = meses.get(`${anio}-${mm}`);
    return { periodo: `${anio}-${mm}`, uf: vUF && vUF > 0 ? Math.round(vUF * 100) / 100 : null, utm: vUTM && vUTM > 0 ? Math.round(vUTM) : null };
  }).filter((x) => x.uf != null || x.utm != null);
}
