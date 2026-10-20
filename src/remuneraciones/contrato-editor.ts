// Editor visual del contrato: el texto de la plantilla se divide en tramos de texto (editables)
// y datos {{marcador}} (se muestran con el valor real de la ficha, destacados y protegidos).
// Lo que se guarda sigue siendo el texto con sus marcadores, así el contrato se actualiza solo
// si cambia un dato de la ficha (sueldo, cargo, jornada...).

import { MARCADORES_CONTRATO } from './contrato-trabajo';

export type Segmento = { tipo: 'texto'; v: string } | { tipo: 'dato'; k: string };

const RE = /\{\{\s*([a-z_]+)\s*\}\}/gi;
const CONOCIDOS = new Set(MARCADORES_CONTRATO.map(([k]) => k));

/** Divide el texto en tramos; los marcadores desconocidos quedan como texto. */
export function segmentos(texto: string): Segmento[] {
  const out: Segmento[] = [];
  let ultimo = 0;
  for (const m of String(texto || '').matchAll(RE)) {
    const k = m[1].toLowerCase();
    if (!CONOCIDOS.has(k)) continue;
    if (m.index! > ultimo) out.push({ tipo: 'texto', v: texto.slice(ultimo, m.index) });
    out.push({ tipo: 'dato', k });
    ultimo = m.index! + m[0].length;
  }
  if (ultimo < String(texto || '').length) out.push({ tipo: 'texto', v: texto.slice(ultimo) });
  return out;
}

/** Vuelve a armar el texto con marcadores. */
export const unirSegmentos = (s: Segmento[]) => s.map((x) => (x.tipo === 'dato' ? `{{${x.k}}}` : x.v)).join('');

/** Nombre del dato para mostrar cuando está vacío o en la ayuda. */
export const nombreDato = (k: string) => MARCADORES_CONTRATO.find(([c]) => c === k)?.[1] ?? k.replace(/_/g, ' ');

/** ¿El texto editado cambió respecto de la plantilla? (ignora espacios al final de las líneas y saltos finales) */
export const cambioTexto = (a: string, b: string) => {
  const n = (s: string) => String(s || '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').trim();
  return n(a) !== n(b);
};
