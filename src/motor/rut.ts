// Utilidades de RUT chileno (módulo 11), traslado de core.js.

export function rutDV(codigo: string | number): string {
  let s = 0;
  let m = 2;
  const str = String(codigo);
  for (let i = str.length - 1; i >= 0; i--) {
    s += parseInt(str[i], 10) * m;
    m = m === 7 ? 2 : m + 1;
  }
  const r = 11 - (s % 11);
  return r === 11 ? '0' : r === 10 ? 'K' : String(r);
}

export interface RutParseado {
  codigo: string;
  dv: string;
  valido: boolean;
  raw: string;
}

/** Acepta puntos y guion; los ignora. */
export function rutParse(input: unknown): RutParseado {
  const clean = String(input ?? '').replace(/[^0-9kK]/g, '').toUpperCase();
  if (clean.length < 2) return { codigo: '', dv: '', valido: false, raw: clean };
  const codigo = clean.slice(0, -1);
  const dv = clean.slice(-1);
  if (!/^\d+$/.test(codigo)) return { codigo: '', dv: '', valido: false, raw: clean };
  return { codigo, dv, valido: rutDV(codigo) === dv, raw: clean };
}

/** Formato de despliegue: 12.345.678-9 */
export function rutFmt(codigo: string | number, dv?: string): string {
  if (!codigo) return '';
  const c = String(codigo);
  let r = '';
  for (let i = c.length; i > 0; i -= 3) r = (i - 3 > 0 ? '.' : '') + c.slice(Math.max(0, i - 3), i) + r;
  return r.replace(/^\./, '') + '-' + String(dv ?? '').toUpperCase();
}

export function rutPartes(rut: unknown): { rutCodigo: string; rutDV: string } {
  const limpio = String(rut ?? '').replace(/[^0-9kK]/g, '').toUpperCase();
  if (limpio.length < 2) return { rutCodigo: '', rutDV: '' };
  return { rutCodigo: limpio.slice(0, -1), rutDV: limpio.slice(-1) };
}
