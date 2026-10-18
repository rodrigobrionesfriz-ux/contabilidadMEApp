import * as XLSX from 'xlsx';
import type { HojasRespaldo, Fila } from './respaldo';

const CON_ENCABEZADO = ['Ventas', 'Compras', 'Honorarios', 'Asientos', 'Apertura', 'CierresContables', 'CentrosCosto', 'PlanDeCuentas'] as const;

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
    if (hoja) h[nombre] = XLSX.utils.sheet_to_json<Fila>(hoja, { defval: '' });
  }
  return h;
}
