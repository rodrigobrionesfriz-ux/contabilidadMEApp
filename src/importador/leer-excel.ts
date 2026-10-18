import * as XLSX from 'xlsx';
import type { HojasRespaldo, Fila } from './respaldo';

const CON_ENCABEZADO = ['Ventas', 'Compras', 'Honorarios', 'Asientos', 'Apertura', 'CierresContables', 'CentrosCosto', 'PlanDeCuentas'] as const;

/**
 * Excel no admite más de 32.767 caracteres por celda: el sistema actual reparte los
 * JSON largos en columnas de continuación «<columna>__2», «<columna>__3»... Se unen aquí.
 */
export function unirTrozos(filas: Fila[]): Fila[] {
  return filas.map((f) => {
    const ks = Object.keys(f).filter((k) => /__\d+$/.test(k));
    if (!ks.length) return f;
    const o: Fila = { ...f };
    ks.sort((a, b) => Number(a.match(/__(\d+)$/)![1]) - Number(b.match(/__(\d+)$/)![1]));
    for (const k of ks) {
      const base = k.replace(/__\d+$/, '');
      o[base] = String(o[base] ?? '') + String(o[k] ?? '');
      delete o[k];
    }
    return o;
  });
}

/** Lee el respaldo .xlsx del sistema actual (ArrayBuffer) y devuelve sus hojas. */
export function leerRespaldo(buf: ArrayBuffer | Uint8Array): HojasRespaldo {
  const wb = XLSX.read(buf, { type: 'array' });
  if (!wb.Sheets['Empresa'] || !wb.Sheets['Asientos']) {
    throw new Error('El archivo no parece un respaldo del sistema actual (faltan las hojas "Empresa" y "Asientos").');
  }
  const h: HojasRespaldo = {
    Empresa: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Empresa'], { header: 1, defval: '' }),
  };
  for (const nombre of CON_ENCABEZADO) {
    const hoja = wb.Sheets[nombre];
    if (hoja) h[nombre] = unirTrozos(XLSX.utils.sheet_to_json<Fila>(hoja, { defval: '' }));
  }
  return h;
}
