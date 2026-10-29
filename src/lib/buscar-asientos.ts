// Buscador de comprobantes: N° de asiento, monto o texto (glosa, cuenta, nombre de cuenta, RUT, folio, centro de costo).
// Cada palabra escrita debe aparecer en el comprobante (Y). Una palabra numérica ("1.732.555", "41") busca el N° de
// asiento, los montos de las líneas y el total, además de códigos, RUT y folios.

export interface LineaBusqueda { cuenta: string; debe: number; haber: number; glosa: string | null; centro_costo: string | null; rut_auxiliar: string | null; folio?: string | null }
export interface AsientoBusqueda { id: string; numero: number; fecha: string; glosa: string; tipo: string; anulado: boolean; asiento_lineas: LineaBusqueda[] }

const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const totalAsiento = (a: AsientoBusqueda) => a.asiento_lineas.reduce((s, l) => s + Number(l.debe), 0);

/** Texto donde se busca cada comprobante (se arma una vez). */
export function indiceAsiento(a: AsientoBusqueda, nombre: (cuenta: string) => string | undefined) {
  const partes = [a.glosa, a.tipo, ...a.asiento_lineas.flatMap((l) => [l.cuenta, nombre(l.cuenta) ?? '', l.glosa ?? '', l.centro_costo ?? '', l.rut_auxiliar ?? '', l.folio ?? ''])];
  const montos = [totalAsiento(a), ...a.asiento_lineas.flatMap((l) => [Number(l.debe), Number(l.haber)])].filter((n) => n > 0).map((n) => String(Math.round(n)));
  return { texto: normal(partes.join(' ')), digitos: partes.join(' ').replace(/[^0-9 ]/g, ''), montos, numero: String(a.numero) };
}

export type Indice = ReturnType<typeof indiceAsiento>;

/** ¿El comprobante cumple con lo escrito? Devuelve un puntaje (0 = no cumple) para ordenar. */
export function puntaje(ix: Indice, consulta: string): number {
  const palabras = normal(consulta).split(/\s+/).filter(Boolean);
  if (!palabras.length) return 1;
  let total = 0;
  for (const p of palabras) {
    const num = /^[\d.$]+$/.test(p) ? p.replace(/[^0-9]/g, '') : '';
    if (num) {
      if (ix.numero === num) total += 100;
      else if (ix.montos.includes(num)) total += 50;
      else if (num.length >= 3 && ix.montos.some((m) => m.includes(num))) total += 10;
      else if (ix.numero.startsWith(num)) total += 5;
      else if (num.length >= 3 && ix.digitos.includes(num)) total += 3;
      else return 0;
    } else if (ix.texto.includes(p)) total += 2;
    else return 0;
  }
  return total;
}
