const fmtCLP = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });

/** $1.234.567 (los montos contables van en pesos enteros) */
export const clp = (n: number | string | null | undefined) => {
  const v = Math.round(Number(n ?? 0));
  return (v < 0 ? '-$' : '$') + fmtCLP.format(Math.abs(v));
};

/** 2026-03-10 → 10/03/2026 */
export const fechaCL = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};

export const hoyISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

/** Rol dentro de una empresa (lo que hace cada uno en ella; los módulos los define su perfil de acceso). */
export const NOMBRE_ROL = { admin: '👑 Dueño', contador: '📝 Trabaja', consulta: '👁 Sólo consulta' } as const;

export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** Rango de fechas de un año, opcionalmente hasta el último día de un mes (1-12). */
export function rangoAnio(anio: number, mesHasta?: number, mesDesde?: number) {
  const hasta = mesHasta ? new Date(Date.UTC(anio, mesHasta, 0)).toISOString().slice(0, 10) : `${anio}-12-31`;
  const desde = mesDesde ? `${anio}-${String(mesDesde).padStart(2, '0')}-01` : `${anio}-01-01`;
  return { desde, hasta };
}

/** Lee un parámetro de búsqueda simple (string) */
export const param = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/** Lee un número escrito a la chilena ("41.247,63", "4,5", "1.000") o con punto decimal ("41247.63"). */
export function decimalCL(v: string | number | null | undefined): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v ?? '').trim().replace(/[\s$]/g, '');
  if (!s) return 0;
  let norm = s;
  if (s.includes(',')) norm = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) norm = s.replace(/\./g, '');
  const n = Number(norm);
  return Number.isFinite(n) ? n : 0;
}

/** Decimal chico (UF, %): el punto también es decimal ("3.516" = 3,516), nunca separador de miles. */
export function decimalCorto(v: string | number | null | undefined): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v ?? '').trim().replace(/[\s$]/g, '');
  if (!s) return 0;
  const norm = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(norm);
  return Number.isFinite(n) ? n : 0;
}

/** Muestra un decimal con coma ("41247,63"). */
export const decimalTexto = (n: number | null | undefined) => (n ? String(n).replace('.', ',') : '');

/**
 * Monto mientras se digita: sólo dígitos (y signo menos al inicio), con separador de miles.
 * `maxDigitos` limita el largo (10 dígitos = "9.999.999.999", 13 caracteres).
 */
export function milesInput(v: string | number | null | undefined, maxDigitos?: number): string {
  // Un número se redondea antes (12345.6 → "12.346"); el texto se toma dígito a dígito
  const t = typeof v === 'number' ? (Number.isFinite(v) ? String(Math.round(v)) : '') : String(v ?? '').trim();
  const neg = t.startsWith('-');
  let dig = t.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
  if (maxDigitos && dig.length > maxDigitos) dig = dig.slice(0, maxDigitos);
  if (!dig) return neg ? '-' : '';
  return (neg ? '-' : '') + dig.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Número con decimales mientras se digita ("41.247,63"): miles con punto y la coma como decimal.
 * Los puntos los pone el formato; un punto que se escribe al final (sin coma aún) se toma como la coma decimal.
 * Con un número, lo muestra a la chilena. Se lee de vuelta con decimalCL.
 */
export function decimalInput(v: string | number | null | undefined, maxDecimales = 6): string {
  if (typeof v === 'number') return Number.isFinite(v) ? v.toLocaleString('es-CL', { maximumFractionDigits: maxDecimales }) : '';
  let t = String(v ?? '').trim();
  if (!t.includes(',') && t.endsWith('.')) t = t.slice(0, -1) + ',';
  const neg = t.startsWith('-');
  const [ent, ...resto] = t.split(',');
  const dec = resto.join('').replace(/[^0-9]/g, '').slice(0, maxDecimales);
  const e = milesInput(ent.replace('-', ''));
  if (!e && !t.includes(',')) return neg ? '-' : '';
  return (neg ? '-' : '') + (e || '0') + (t.includes(',') ? ',' + dec : '');
}

/** Ancho de las columnas Debe y Haber: caben 13 caracteres ("9.999.999.999") alineados a la derecha. */
export const ANCHO_MONTO = 'w-[calc(13ch+1.75rem)]';
