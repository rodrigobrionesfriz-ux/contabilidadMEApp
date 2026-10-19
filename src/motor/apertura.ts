// Balance de apertura: lectura de saldos pegados desde Excel y utilidades del editor.

export interface LineaApertura {
  cuenta: string;
  debe: number;
  haber: number;
  rut?: string;
  dte?: string;
  folio?: string;
  glosa?: string;
}

/**
 * Monto en formato chileno o de Excel: "1.234.567", "1234567", "-1.234", "(1.234)", "$ 1.234".
 * Los decimales (",50") se redondean a pesos.
 */
export function montoCL(v: string | undefined): number | null {
  let s = (v ?? '').trim().replace(/\$/g, '').replace(/\s/g, '');
  if (!s) return null;
  let signo = 1;
  if (/^\(.*\)$/.test(s)) { signo = -1; s = s.slice(1, -1); }
  if (s.startsWith('-')) { signo = -signo; s = s.slice(1); }
  if (!/^[0-9.,]+$/.test(s)) return null;
  // Con coma: la coma es decimal y los puntos son miles. Sin coma: puntos de miles
  // (salvo un único punto seguido de 1 o 2 dígitos, que es decimal como lo copia Excel en inglés).
  let n: number;
  if (s.includes(',')) n = Number(s.replace(/\./g, '').replace(',', '.'));
  else if (/^\d+\.\d{1,2}$/.test(s)) n = Number(s);
  else n = Number(s.replace(/\./g, ''));
  return Number.isFinite(n) ? signo * Math.round(n) : null;
}

/**
 * Lee filas copiadas desde Excel (separadas por tabulación o punto y coma). Formatos aceptados:
 *  - cuenta, debe, haber [, rut, tipo DTE, folio, glosa]
 *  - cuenta, saldo  (positivo = debe, negativo = haber)
 * La cuenta puede venir como "1101201" o "1101201 · BANCO ESTADO". Se omiten encabezados y filas sin cuenta.
 */
export function leerPegado(texto: string): { lineas: LineaApertura[]; omitidas: number } {
  const lineas: LineaApertura[] = [];
  let omitidas = 0;
  for (const fila of texto.split(/\r?\n/)) {
    if (!fila.trim()) continue;
    const c = fila.split(fila.includes('\t') ? '\t' : ';').map((x) => x.trim());
    const cuenta = (c[0].match(/^\d{3,}/) ?? [''])[0];
    if (!cuenta) { omitidas++; continue; }
    // La segunda columna puede ser el nombre de la cuenta: se salta si no es un monto
    const resto = montoCL(c[1]) === null && c[1] !== '' && c.length > 2 ? c.slice(2) : c.slice(1);
    const a = montoCL(resto[0]);
    const b = montoCL(resto[1]);
    let debe = 0, haber = 0;
    if (a !== null && (b === null || resto.length < 2)) {
      if (a >= 0) debe = a; else haber = -a; // cuenta, saldo
    } else {
      const d = a ?? 0, h = b ?? 0;
      const neto = d - h; // admite debe y haber en la misma fila: queda el saldo neto
      if (neto >= 0) debe = neto; else haber = -neto;
    }
    if (!debe && !haber) { omitidas++; continue; }
    const extra = resto.slice(2);
    const l: LineaApertura = { cuenta, debe, haber };
    if (extra[0]) l.rut = extra[0];
    if (extra[1]) l.dte = extra[1].replace(/[^0-9]/g, '') || undefined;
    if (extra[2]) l.folio = extra[2];
    if (extra[3]) l.glosa = extra[3];
    lineas.push(l);
  }
  return { lineas, omitidas };
}

export function totales(lineas: Pick<LineaApertura, 'debe' | 'haber'>[]) {
  const debe = lineas.reduce((s, l) => s + (l.debe || 0), 0);
  const haber = lineas.reduce((s, l) => s + (l.haber || 0), 0);
  return { debe, haber, diferencia: debe - haber, cuadra: debe > 0 && debe === haber };
}

/** Línea que salda la diferencia contra una cuenta de patrimonio (o null si ya cuadra). */
export function lineaDiferencia(lineas: Pick<LineaApertura, 'debe' | 'haber'>[], cuenta: string, glosa = 'Diferencia de apertura'): LineaApertura | null {
  const { diferencia } = totales(lineas);
  if (!diferencia) return null;
  return diferencia > 0 ? { cuenta, debe: 0, haber: diferencia, glosa } : { cuenta, debe: -diferencia, haber: 0, glosa };
}
