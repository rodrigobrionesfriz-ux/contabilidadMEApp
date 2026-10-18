// Feriado legal (vacaciones): traslado fiel de vacaciones.js del sistema actual.
//  - Art. 67: 15 días hábiles por año (20 en zonas extremas), 1,25 por mes.
//  - Art. 68: progresivos (1 día por cada 3 años nuevos sobre 10 de trabajo).
//  - Art. 69: sábado, domingo y festivos son inhábiles.

import type { EventoAsistencia, Trabajador } from './calculo';

export interface CfgFeriados { extra: { fecha: string; nombre?: string }[]; quitar: string[] }
export const CFG_FERIADOS_VACIA: CfgFeriados = { extra: [], quitar: [] };
export interface FichaVacaciones { zonaExtrema?: boolean; saldoInicial?: number | string | null; fechaSaldo?: string; aniosPrevios?: number | string }

const ZONA_EXTREMA_DIAS = 20, DIAS_BASE = 15;
const esFecha = (s: unknown): s is string => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

function pascua(y: number) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, mes - 1, dia));
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
const ymd = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const dow = (d: Date) => d.getUTCDay();
const masDias = (d: Date, n: number) => new Date(d.getTime() + n * 864e5);
// Solsticio de invierno (Día de los Pueblos Indígenas), fijado por decreto cada año
const SOLSTICIO: Record<number, number> = { 2024: 20, 2025: 20, 2026: 21, 2027: 21, 2028: 20, 2029: 20, 2030: 21 };
// Ley 19.668: 29 jun y 12 oct se trasladan al lunes
function trasladoLunes(d: Date) { const w = dow(d); if (w >= 2 && w <= 4) return masDias(d, 1 - w); if (w === 5) return masDias(d, 3); return d; }

export function feriadosAnio(y: number) {
  const f = new Map<string, string>();
  const add = (d: Date, nm: string) => f.set(iso(d), nm);
  add(ymd(y, 1, 1), 'Año Nuevo');
  if (dow(ymd(y, 1, 2)) === 1) add(ymd(y, 1, 2), 'Feriado 2 de enero');
  const p = pascua(y); add(masDias(p, -2), 'Viernes Santo'); add(masDias(p, -1), 'Sábado Santo');
  add(ymd(y, 5, 1), 'Día del Trabajo'); add(ymd(y, 5, 21), 'Glorias Navales');
  add(ymd(y, 6, SOLSTICIO[y] || 21), 'Día de los Pueblos Indígenas');
  add(trasladoLunes(ymd(y, 6, 29)), 'San Pedro y San Pablo');
  add(ymd(y, 7, 16), 'Virgen del Carmen'); add(ymd(y, 8, 15), 'Asunción de la Virgen');
  if (dow(ymd(y, 9, 17)) === 1) add(ymd(y, 9, 17), 'Feriado Fiestas Patrias');
  add(ymd(y, 9, 18), 'Independencia Nacional'); add(ymd(y, 9, 19), 'Glorias del Ejército');
  if (dow(ymd(y, 9, 20)) === 5) add(ymd(y, 9, 20), 'Feriado Fiestas Patrias');
  add(trasladoLunes(ymd(y, 10, 12)), 'Encuentro de Dos Mundos');
  // Ley 20.299: martes → viernes anterior; miércoles → viernes siguiente
  const ev = ymd(y, 10, 31); add(dow(ev) === 2 ? masDias(ev, -4) : dow(ev) === 3 ? masDias(ev, 2) : ev, 'Iglesias Evangélicas');
  add(ymd(y, 11, 1), 'Todos los Santos'); add(ymd(y, 12, 8), 'Inmaculada Concepción'); add(ymd(y, 12, 25), 'Navidad');
  return f;
}

const CACHE = new Map<number, Map<string, string>>();
export function esFeriado(fechaIso: string, cfg: CfgFeriados = CFG_FERIADOS_VACIA): string | null {
  const y = +fechaIso.slice(0, 4);
  if (!CACHE.has(y)) CACHE.set(y, feriadosAnio(y));
  if (cfg.quitar.includes(fechaIso)) return null;
  const ex = cfg.extra.find((x) => x.fecha === fechaIso);
  if (ex) return ex.nombre || 'Feriado';
  return CACHE.get(y)!.get(fechaIso) || null;
}

/** Días hábiles para el feriado legal: lunes a viernes que no sean festivos. */
export function diasHabiles(desde: string, hasta: string | undefined, cfg: CfgFeriados = CFG_FERIADOS_VACIA) {
  if (!esFecha(desde)) return { habiles: 0, feriados: [] as { fecha: string; nombre: string }[] };
  const h = esFecha(hasta) && hasta >= desde ? hasta : desde;
  let d = new Date(desde + 'T00:00:00Z'); const fin = new Date(h + 'T00:00:00Z');
  let n = 0; const fer: { fecha: string; nombre: string }[] = [];
  while (d <= fin) {
    const w = dow(d), k = iso(d);
    if (w >= 1 && w <= 5) { const nf = esFeriado(k, cfg); if (nf) fer.push({ fecha: k, nombre: nf }); else n++; }
    d = masDias(d, 1);
  }
  return { habiles: n, feriados: fer };
}

/** Meses completos de servicio (incluye el día "hasta"). */
export function mesesEntre(desde: string, hasta: string) {
  const a = new Date(desde + 'T00:00:00Z'), b = masDias(new Date(hasta + 'T00:00:00Z'), 1);
  if (b <= a) return 0;
  let m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) m--;
  return Math.max(0, m);
}

/** Días progresivos según años con el empleador actual y años anteriores certificados (máx. 10). */
export function progresivos(aniosActual: number, aniosPrevios: unknown) {
  const A = Math.min(10, Math.max(0, Math.floor(+(aniosPrevios as number) || 0)));
  const nuevos = Math.floor(aniosActual) - Math.max(0, 10 - A);
  return nuevos > 0 ? Math.floor(nuevos / 3) : 0;
}

/** Saldo de vacaciones a una fecha. Las tomadas son los eventos "vacaciones" de la asistencia. */
export function saldoVacaciones(t: Trabajador, fechaCorte: string, eventos: EventoAsistencia[], cfg: CfgFeriados = CFG_FERIADOS_VACIA) {
  const v: FichaVacaciones = t.vacaciones || {};
  const inicio = t.lre && t.lre.fechaInicio;
  const corte = fechaCorte;
  const base = v.zonaExtrema ? ZONA_EXTREMA_DIAS : DIAS_BASE;
  if (!inicio) return { ok: false as const, motivo: 'Falta la fecha de inicio del contrato en la ficha del trabajador', base };
  const tieneInicial = v.saldoInicial !== undefined && v.saldoInicial !== null && v.saldoInicial !== '' && esFecha(v.fechaSaldo);
  const desdeDev = tieneInicial && v.fechaSaldo! > inicio ? v.fechaSaldo! : inicio;
  const fin = t.lre && t.lre.fechaTermino && t.lre.fechaTermino < corte ? t.lre.fechaTermino : corte;
  const nMeses = mesesEntre(desdeDev, fin);
  const mIni = mesesEntre(inicio, desdeDev);
  let devengado = 0, devProgresivo = 0;
  for (let i = 1; i <= nMeses; i++) {
    const anios = Math.floor((mIni + i - 1) / 12);
    const pg = progresivos(anios, v.aniosPrevios);
    devengado += (base + pg) / 12; devProgresivo += pg / 12;
  }
  const mesesTot = mesesEntre(inicio, fin);
  const aniosActual = Math.floor(mesesTot / 12);
  const progActual = progresivos(aniosActual, v.aniosPrevios);
  const tomadas = eventos.filter((e) => e.trab === t.id && e.tipo === 'vacaciones' && e.desde >= desdeDev && e.desde <= fin)
    .map((e) => ({ ...e, ...diasHabiles(e.desde, e.hasta || e.desde, cfg) }));
  const diasTomados = tomadas.reduce((s, e) => s + e.habiles, 0);
  const inicial = tieneInicial ? (+(v.saldoInicial as number) || 0) : 0;
  const saldo = +(inicial + devengado - diasTomados).toFixed(2);
  const anual = base + progActual;
  let faltan: number | null = null;
  for (let k = aniosActual + 1; k <= aniosActual + 40; k++) if (progresivos(k, v.aniosPrevios) > progActual) { faltan = k - aniosActual; break; }
  return {
    ok: true as const, base, inicio, desdeDev, corte: fin, inicial, tieneInicial, meses: nMeses,
    devengado: +devengado.toFixed(2), devProgresivo: +devProgresivo.toFixed(2),
    tomadas, diasTomados, saldo, anual, aniosActual, mesesTot, progActual, faltan,
    excedeAcumulacion: saldo > 2 * anual, aniosPrevios: Math.min(10, +(v.aniosPrevios as number) || 0),
  };
}
export type SaldoVacaciones = ReturnType<typeof saldoVacaciones>;

/** Lee el texto de feriados adicionales ("AAAA-MM-DD nombre", o "- AAAA-MM-DD" para quitar uno). */
export function leerFeriadosTexto(txt: string): CfgFeriados & { malos: string[] } {
  const extra: CfgFeriados['extra'] = [], quitar: string[] = [], malos: string[] = [];
  String(txt || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean).forEach((l) => {
    let m = l.match(/^-\s*(\d{4}-\d{2}-\d{2})$/); if (m) { quitar.push(m[1]); return; }
    m = l.match(/^(\d{4}-\d{2}-\d{2})\s*(.*)$/); if (m) { extra.push({ fecha: m[1], nombre: m[2] || 'Feriado' }); return; }
    malos.push(l);
  });
  return { extra, quitar, malos };
}

export const textoFeriados = (c: CfgFeriados) => [...c.extra.map((x) => `${x.fecha} ${x.nombre || ''}`.trim()), ...c.quitar.map((x) => '- ' + x)].join('\n');
