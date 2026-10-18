// Asientos tipo (plantillas de comprobantes): traslado fiel de comprobantestipo.js y de las
// validaciones de guardarCT (comprobantestipo-ui.js).

export interface LineaCT { cd: string; desc: string; debe: number; haber: number; cc: string }
export interface DistCT { cd: string; pct: number; cc: string }
export interface ComprobanteTipo {
  id: string; nombre: string; descripcion: string; glosa: string; guardaMontos: boolean;
  lineas: LineaCT[]; distActiva: boolean; distBase: number; dist: DistCT[];
}

const norm = (s: unknown) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const fmtPct = (v: number) => String(Math.round((+v || 0) * 100) / 100).replace('.', ',');

/** Búsqueda por nombre, descripción, glosa o código/nombre de cuenta (todas las palabras). */
export function buscarComprobantes(lista: ComprobanteTipo[], q: string, nombreCuenta: (cd: string) => string = () => '') {
  const t = norm(q).trim();
  if (!t) return lista;
  const palabras = t.split(/\s+/);
  return lista.filter((c) => {
    const texto = norm(`${c.nombre} ${c.descripcion} ${c.glosa} ` + c.lineas.map((l) => `${l.cd} ${nombreCuenta(l.cd)} ${l.desc}`).join(' '));
    return palabras.every((p) => texto.includes(p));
  });
}

/** Reparte un monto según porcentajes sin perder ni inventar pesos (el ajuste va al último tramo). */
export function repartir(total: number, pcts: number[]) {
  const t = Math.round(+total || 0);
  if (!t) return pcts.map(() => 0);
  const montos = pcts.map((p) => Math.round(t * (+p || 0) / 100));
  const suma = montos.reduce((s, m) => s + m, 0);
  if (montos.length) montos[montos.length - 1] += t - suma;
  return montos;
}

/** Líneas listas para el formulario de asientos. montoDist: monto a repartir (si la plantilla distribuye). */
export function lineasDesdeComprobante(c: ComprobanteTipo, montoDist: number | null, nombreCuenta: (cd: string) => string = () => '') {
  const lineas = c.lineas.map((l) => ({ cd: l.cd || '', nm: l.cd ? nombreCuenta(l.cd) : '', desc: l.desc || '', debe: c.guardaMontos ? (+l.debe || 0) : 0, haber: c.guardaMontos ? (+l.haber || 0) : 0, cc: l.cc || '' }));
  const dist = (c.dist || []).filter((d) => d.cd && (+d.pct || 0) > 0);
  if (c.distActiva && dist.length) {
    const base = montoDist != null ? (+montoDist || 0) : (c.guardaMontos ? (+c.distBase || 0) : 0);
    const montos = repartir(base, dist.map((d) => +d.pct || 0));
    dist.forEach((d, i) => lineas.push({ cd: d.cd, nm: nombreCuenta(d.cd), desc: `${fmtPct(+d.pct || 0)}%`, debe: montos[i], haber: 0, cc: d.cc || '' }));
  }
  while (lineas.length < 2) lineas.push({ cd: '', nm: '', desc: '', debe: 0, haber: 0, cc: '' });
  return { glosa: c.glosa || '', lineas, distribuido: c.distActiva && dist.length ? dist.length : 0 };
}

/** ¿La plantilla necesita que se indique el monto a repartir al aplicarla? */
export const pideMontoDist = (c: ComprobanteTipo) => c.distActiva && (c.dist || []).some((d) => d.cd && (+d.pct || 0) > 0) && !(c.guardaMontos && +c.distBase > 0);

export function resumenComprobante(c: ComprobanteTipo) {
  const nDist = (c.dist || []).filter((d) => d.cd && (+d.pct || 0) > 0).length;
  const n = c.lineas.filter((l) => l.cd).length + (c.distActiva ? nDist : 0);
  const total = c.lineas.reduce((s, l) => s + (+l.debe || 0), 0);
  return { cuentas: n, dist: c.distActiva ? nDist : 0, total, cuadra: Math.abs(c.lineas.reduce((s, l) => s + (+l.debe || 0) - (+l.haber || 0), 0)) < 1 };
}

/** Quita sólo las filas finales completamente vacías; las intercaladas se respetan. */
export function recortarVacias(lineas: LineaCT[]) {
  const l = lineas.map((x) => ({ ...x }));
  const vacia = (x: LineaCT) => !x.cd && !String(x.desc || '').trim() && !(+x.debe || 0) && !(+x.haber || 0);
  while (l.length && vacia(l[l.length - 1])) l.pop();
  return l;
}
export const distValidas = (dist: DistCT[]) => (dist || []).filter((d) => d.cd && (+d.pct || 0) > 0).map((d) => ({ cd: d.cd, pct: +d.pct || 0, cc: d.cc || '' }));

/** Reparte 100% en partes iguales entre las filas con cuenta; el redondeo va a la última. */
export function repartirIgual(dist: DistCT[]) {
  const idx = dist.map((d, i) => ({ d, i })).filter((x) => x.d.cd).map((x) => x.i);
  if (!idx.length) return dist;
  const out = dist.map((d) => ({ ...d }));
  const base = Math.floor(10000 / idx.length) / 100;
  idx.forEach((i) => { out[i].pct = base; });
  const suma = idx.reduce((s, i) => s + out[i].pct, 0);
  out[idx[idx.length - 1]].pct = Math.round((base + 100 - suma) * 100) / 100;
  return out;
}

/** Valida y normaliza lo que se va a guardar (guardarCT). */
export function prepararComprobante(f: Omit<ComprobanteTipo, 'id'>): { error: string } | { datos: Omit<ComprobanteTipo, 'id'> } {
  const nombre = String(f.nombre || '').trim();
  if (!nombre) return { error: 'Ponle un nombre al comprobante' };
  const lineas = recortarVacias(f.lineas || []);
  const dist = distValidas(f.dist || []);
  if (!lineas.some((l) => l.cd || l.desc) && !dist.length) return { error: 'La plantilla está vacía: agrega al menos una cuenta o una descripción' };
  if (f.distActiva && dist.length) {
    const suma = dist.reduce((s, d) => s + (+d.pct || 0), 0);
    if (Math.abs(suma - 100) > 0.01) return { error: `La distribución suma ${fmtPct(suma)}%: debe sumar 100%` };
  }
  const g = !!f.guardaMontos;
  return { datos: {
    nombre, descripcion: String(f.descripcion || '').trim(), glosa: String(f.glosa || '').trim(), guardaMontos: g,
    lineas: lineas.map((l) => ({ cd: l.cd || '', desc: l.desc || '', debe: g ? (+l.debe || 0) : 0, haber: g ? (+l.haber || 0) : 0, cc: l.cc || '' })),
    distActiva: !!f.distActiva && dist.length > 0, distBase: g ? (+f.distBase || 0) : 0, dist,
  } };
}
