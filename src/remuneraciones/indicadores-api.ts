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

/** Lee las dos series del año desde mindicador.cl (sirve en el navegador y en el servidor). */
export async function leerIndicadoresAPI(anio: number, ms = 20000): Promise<IndicadorAPI[]> {
  const leer = async (k: 'uf' | 'utm'): Promise<SerieAPI> => {
    const r = await fetch(`${API_INDICADORES}/${k}/${anio}`, { cache: 'no-store', signal: AbortSignal.timeout(ms) });
    if (!r.ok) throw new Error(`respondió ${r.status} al pedir la ${k.toUpperCase()}`);
    return r.json();
  };
  const [uf, utm] = await Promise.all([leer('uf'), leer('utm')]);
  return indicadoresDesdeAPI(anio, uf, utm);
}

/** Revisa lo que llega del navegador antes de guardarlo. */
export function datosAPIValidos(anio: number, x: unknown): IndicadorAPI[] | null {
  if (!Array.isArray(x) || x.length > 12) return null;
  const ok = x.every((r) => r && typeof r === 'object' && typeof r.periodo === 'string' && r.periodo.startsWith(`${anio}-`) && /^\d{4}-(0[1-9]|1[0-2])$/.test(r.periodo)
    && (r.uf == null || (typeof r.uf === 'number' && r.uf >= 10000 && r.uf <= 100000))
    && (r.utm == null || (typeof r.utm === 'number' && r.utm >= 30000 && r.utm <= 200000)));
  return ok ? (x as IndicadorAPI[]).map((r) => ({ periodo: r.periodo, uf: r.uf ?? null, utm: r.utm ?? null })) : null;
}
