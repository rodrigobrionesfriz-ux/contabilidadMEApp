// Lectura de UF y UTM desde sii.cl (páginas de Valores y fechas) o mindicador.cl (API libre, datos del Banco Central y SII).
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

// ── sii.cl ──
export const SII_UF = (anio: number) => `https://www.sii.cl/valores_y_fechas/uf/uf${anio}.htm`;
export const SII_UTM = (anio: number) => `https://www.sii.cl/valores_y_fechas/utm/utm${anio}.htm`;
const MESES_SII = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Filas de todas las tablas de la página: texto de cada celda. */
function filasHTML(html: string): string[][] {
  const limpiar = (x: string) => x.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&[a-z]+;/gi, '').replace(/\s+/g, ' ').trim();
  // Corta en cada <tr> (aguanta tablas anidadas y filas sin </tr>); cada celda termina en su cierre o en la siguiente.
  return html.split(/<tr[\s>]/i).slice(1).map((fila) => {
    const cuerpo = fila.split(/<\/tr>|<table[\s>]/i)[0];
    return cuerpo.split(/<t[hd](?=[\s>])/i).slice(1).map((c) => limpiar(c.replace(/^[^>]*>/, '').split(/<\/t[hd]>/i)[0]));
  });
}
const numeroCL = (x: string) => { const t = x.replace(/\./g, '').replace(',', '.'); return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN; };

/**
 * UF del último día de cada mes desde la tabla resumen del SII (Día | Ene | ... | Dic; una fila por día).
 * Devuelve la serie como mindicador para reutilizar indicadoresDesdeAPI.
 */
export function serieUFdeSII(anio: number, html: string): SerieAPI {
  const filas = filasHTML(html);
  const ini = filas.findIndex((f) => f.length === 13 && /^d.{0,3}a$/i.test(f[0]) && /^ene/i.test(f[1]) && /^dic/i.test(f[12]));
  if (ini < 0) return { serie: [] };
  const serie: { fecha: string; valor: number }[] = [];
  for (const f of filas.slice(ini + 1)) {
    const dia = Number(f[0]);
    if (f.length !== 13 || !Number.isInteger(dia) || dia < 1 || dia > 31) break;
    for (let m = 0; m < 12; m++) {
      const v = numeroCL(f[m + 1] ?? '');
      if (v > 0) serie.push({ fecha: `${anio}-${String(m + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`, valor: v });
    }
  }
  return { serie };
}

/** UTM de cada mes desde la tabla del SII (Mes | UTM | UTA | IPC...). */
export function serieUTMdeSII(anio: number, html: string): SerieAPI {
  const serie: { fecha: string; valor: number }[] = [];
  for (const f of filasHTML(html)) {
    const m = MESES_SII.indexOf((f[0] ?? '').toLowerCase());
    const v = numeroCL(f[1] ?? '');
    if (m >= 0 && v > 0) serie.push({ fecha: `${anio}-${String(m + 1).padStart(2, '0')}-01`, valor: v });
  }
  return { serie };
}

/** Lee UF y UTM del año desde sii.cl (sólo en el servidor: el SII no permite consultas desde otras páginas). */
export async function leerIndicadoresSII(anio: number, ms = 15000): Promise<IndicadorAPI[]> {
  const leer = async (url: string) => {
    const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(ms), headers: { 'user-agent': 'Mozilla/5.0 (ContabilidadME)' } });
    if (!r.ok) throw new Error(`sii.cl respondió ${r.status}`);
    return new TextDecoder('latin1').decode(await r.arrayBuffer());
  };
  const [uf, utm] = await Promise.all([leer(SII_UF(anio)), leer(SII_UTM(anio))]);
  return indicadoresDesdeAPI(anio, serieUFdeSII(anio, uf), serieUTMdeSII(anio, utm));
}
