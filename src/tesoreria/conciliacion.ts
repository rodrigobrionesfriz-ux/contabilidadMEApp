// Conciliación bancaria: traslado de conciliacion.js. Se marcan las líneas del mayor de la cuenta
// que aparecen en la cartola; la diferencia es saldo según libros − saldo según banco.
// La cartola (Excel o CSV) se lee buscando en cada fila una fecha y un monto.

export interface MovBanco { id: number; fecha: string; glosa: string; debe: number; haber: number }
export interface LineaCartola { fecha: string; desc: string; monto: number }

const RE_FECHA = /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$|^\d{4}-\d{2}-\d{2}$/;
const RE_MONTO = /^[-+]?\s*\$?\s*-?\d{1,3}(\.\d{3})+(,\d+)?$|^[-+]?\s*\$?\s*-?\d+(,\d+)?$/;
/** Monto escrito como texto ("-350.000", "$ 5.000.000", "1234,5"); null si no lo es. */
function montoTexto(s: string): number | null {
  if (!RE_MONTO.test(s)) return null;
  const neg = s.includes('-');
  const n = Number(s.replace(/[^\d,]/g, '').replace(',', '.'));
  return isFinite(n) ? (neg ? -n : n) : null;
}
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Filas de la planilla → movimientos (primera fecha, primer monto de valor absoluto > 100 y primer texto).
 *  Además del sistema actual acepta fechas de Excel (Date) y montos escritos como texto (CSV). */
export function leerCartola(filas: unknown[][]): LineaCartola[] {
  const out: LineaCartola[] = [];
  for (const r of filas) {
    if (!r || !r.length) continue;
    let fecha: string | null = null, monto: number | null = null, desc = '';
    for (const cell of r) {
      if (cell == null) continue;
      if (cell instanceof Date) { if (!fecha && !isNaN(cell.getTime())) fecha = iso(cell); continue; }
      const s = String(cell).trim();
      const mt = typeof cell === 'number' ? cell : montoTexto(s);
      if (!fecha && RE_FECHA.test(s)) fecha = s;
      else if (mt !== null && Math.abs(mt) > 100 && monto === null) monto = mt;
      else if (s.length > 3 && !/^\d+$/.test(s)) desc = desc || s;
    }
    if (fecha && monto !== null) out.push({ fecha, desc, monto });
  }
  return out;
}

export function resumenConciliacion(movs: MovBanco[], conciliados: Set<number>, saldoBanco: number) {
  const neto = (m: MovBanco) => (m.debe || 0) - (m.haber || 0);
  const saldoLibros = movs.reduce((s, m) => s + neto(m), 0);
  const pendientes = movs.filter((m) => !conciliados.has(m.id));
  return {
    saldoLibros, saldoBanco, diferencia: saldoLibros - saldoBanco,
    pendientes: pendientes.length, sumaPendientes: pendientes.reduce((s, m) => s + neto(m), 0),
    conciliados: movs.length - pendientes.length,
    cuadra: Math.abs(saldoLibros - saldoBanco) < 1 && saldoBanco !== 0,
  };
}

/** Empareja cada línea de la cartola con un movimiento pendiente del mismo monto (en valor absoluto, igual que el sistema actual). */
export function emparejarCartola(cartola: LineaCartola[], movs: MovBanco[], conciliados: Set<number>) {
  const usados = new Set(conciliados);
  const pares: { cartola: LineaCartola; mov: MovBanco }[] = [], sinMatch: LineaCartola[] = [];
  for (const c of cartola) {
    const abs = Math.abs(c.monto);
    const m = movs.find((x) => !usados.has(x.id) && Math.abs(Math.abs((x.debe || 0) - (x.haber || 0)) - abs) < 1);
    if (m) { usados.add(m.id); pares.push({ cartola: c, mov: m }); } else sinMatch.push(c);
  }
  return { pares, sinMatch };
}
