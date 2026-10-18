// Finiquitos de contrato de trabajo: traslado fiel de calcularFiniquito y las
// plantillas de finiquitos.js del sistema actual.
//  - Art. 159, 160, 161: causales. Art. 162: aviso de 30 días o indemnización sustitutiva.
//  - Art. 163: 30 días por año y fracción superior a 6 meses, máx. 11 años (requiere 1 año).
//  - Art. 172: última remuneración con tope de 90 UF.
//  - Art. 73: feriado pendiente y proporcional en días corridos.
//  - Art. 13 Ley 19.728: descuento del aporte del empleador al seguro de cesantía (1,6%).

import { asistenciaMes, calcularLiquidacion, type ContextoRem, type Trabajador } from './calculo';
import { esFeriado, mesesEntre, saldoVacaciones, type CfgFeriados, CFG_FERIADOS_VACIA } from './vacaciones';
import { clp, decimalCL } from '@/lib/formato';
import { numeroALetras } from '@/lib/numletras';

export interface Causal { k: string; nm: string; art: string; plantilla: string; aviso?: 'renuncia' | 'despido'; hechos?: boolean; numeral?: boolean; ias?: boolean }
export const CAUSALES: Causal[] = [
  { k: '159-1', nm: 'Mutuo acuerdo de las partes', art: 'artículo 159 N° 1', plantilla: 'mutuo' },
  { k: '159-2', nm: 'Renuncia voluntaria del trabajador', art: 'artículo 159 N° 2', plantilla: 'renuncia', aviso: 'renuncia' },
  { k: '159-4', nm: 'Vencimiento del plazo convenido en el contrato', art: 'artículo 159 N° 4', plantilla: 'plazo' },
  { k: '159-5', nm: 'Conclusión del trabajo o servicio que dio origen al contrato', art: 'artículo 159 N° 5', plantilla: 'obra' },
  { k: '159-6', nm: 'Caso fortuito o fuerza mayor', art: 'artículo 159 N° 6', plantilla: 'generica', hechos: true },
  { k: '160', nm: 'Conducta del trabajador (Art. 160)', art: 'artículo 160', plantilla: 'generica', hechos: true, numeral: true },
  { k: '161-1', nm: 'Necesidades de la empresa, establecimiento o servicio', art: 'artículo 161 inciso primero', plantilla: 'necesidades', ias: true, aviso: 'despido', hechos: true },
  { k: '161-2', nm: 'Desahucio escrito del empleador', art: 'artículo 161 inciso segundo', plantilla: 'desahucio', ias: true, aviso: 'despido' },
];
export const NUMERALES_160: [string, string, string][] = [
  ['1a', 'N° 1 letra a)', 'falta de probidad del trabajador en el desempeño de sus funciones'],
  ['1b', 'N° 1 letra b)', 'conductas de acoso sexual'], ['1c', 'N° 1 letra c)', 'vías de hecho ejercidas por el trabajador'],
  ['1d', 'N° 1 letra d)', 'injurias proferidas por el trabajador al empleador'], ['1e', 'N° 1 letra e)', 'conducta inmoral del trabajador que afecte a la empresa'],
  ['1f', 'N° 1 letra f)', 'conductas de acoso laboral'], ['2', 'N° 2', 'negociaciones que ejecute el trabajador dentro del giro del negocio y que hubiesen sido prohibidas por escrito en el contrato'],
  ['3', 'N° 3', 'no concurrencia del trabajador a sus labores sin causa justificada'], ['4a', 'N° 4 letra a)', 'abandono del trabajo'],
  ['4b', 'N° 4 letra b)', 'negativa a trabajar sin causa justificada en las faenas convenidas'], ['5', 'N° 5', 'actos, omisiones o imprudencias temerarias que afecten la seguridad'],
  ['6', 'N° 6', 'perjuicio material causado intencionalmente en las instalaciones, maquinarias, herramientas o mercaderías'],
  ['7', 'N° 7', 'incumplimiento grave de las obligaciones que impone el contrato'],
];
export const causalInfo = (k: string | undefined) => CAUSALES.find((c) => c.k === k) || CAUSALES[1];
const TOPE_UF_ART172 = 90, MAX_ANIOS_IAS = 11, TASA_AFC_CIC_EMPLEADOR = 0.016, INICIO_AFC = '2002-10-01';

// ── Plantillas tipo ──
const ENCABEZADO = `FINIQUITO DE CONTRATO DE TRABAJO

En {{ciudad}}, a {{fecha_finiquito}}, entre {{empresa}}, RUT {{rut_empresa}}, representada por {{representante}}, RUT {{rut_representante}}, ambos con domicilio en {{domicilio_empresa}}, en adelante "el empleador", y don(ña) {{trabajador}}, RUT {{rut_trabajador}}, en adelante "el trabajador", se deja constancia del siguiente finiquito:

PRIMERO: El trabajador prestó servicios al empleador en el cargo de {{cargo}}, desde el {{fecha_inicio}} hasta el {{fecha_termino}}, fecha en que terminó su contrato de trabajo por la causal de {{causal}}, {{causal_articulo}} del Código del Trabajo.`;
const PAGO = `TERCERO: El trabajador declara recibir en este acto, a su entera satisfacción, la suma de {{total}} ({{total_palabras}}), mediante {{forma_pago}}, según el siguiente detalle:

{{detalle}}`;
const COTIZ = `CUARTO: El empleador declara, y el trabajador lo reconoce, que las cotizaciones previsionales y de seguridad social del trabajador se encuentran íntegramente pagadas hasta el último día del mes anterior al término del contrato, lo que se acredita con los certificados de las instituciones respectivas, conforme al artículo 162 del Código del Trabajo.`;
const RENUNCIA_DERECHOS = `QUINTO: El trabajador declara que durante todo el tiempo que prestó servicios recibió oportunamente el total de las remuneraciones, beneficios y demás prestaciones convenidas, y que nada se le adeuda por concepto de remuneraciones, horas extraordinarias, feriados, gratificaciones, cotizaciones previsionales, indemnizaciones ni por ningún otro concepto, legal o contractual. En consecuencia, otorga al empleador el más amplio, total y completo finiquito, declarando que no tiene reclamo ni cargo alguno que formular.`;
const CIERRE = `SEXTO: El presente finiquito se firma en dos ejemplares, quedando uno en poder de cada parte, y será ratificado por el trabajador ante un ministro de fe, conforme al artículo 177 del Código del Trabajo.`;
const armar = (segundo: string) => [ENCABEZADO, segundo, PAGO, COTIZ, RENUNCIA_DERECHOS, CIERRE].join('\n\n');

export interface Plantilla { id: string; nombre: string; causal: string; texto: string; tipo?: boolean; editada?: boolean }
export const PLANTILLAS_TIPO: Plantilla[] = [
  { id: 'renuncia', nombre: 'Renuncia voluntaria (Art. 159 N° 2)', causal: '159-2', texto: armar(
    `SEGUNDO: El término del contrato se produjo por la renuncia voluntaria del trabajador, presentada por escrito al empleador con fecha {{fecha_aviso}}.`) },
  { id: 'mutuo', nombre: 'Mutuo acuerdo (Art. 159 N° 1)', causal: '159-1', texto: armar(
    `SEGUNDO: Las partes, de común acuerdo, han decidido poner término al contrato de trabajo que las vinculaba a contar de la fecha indicada en la cláusula anterior.`) },
  { id: 'plazo', nombre: 'Vencimiento del plazo (Art. 159 N° 4)', causal: '159-4', texto: armar(
    `SEGUNDO: El contrato de trabajo, celebrado a plazo fijo, terminó por el vencimiento del plazo convenido por las partes, lo que fue comunicado al trabajador por escrito.`) },
  { id: 'obra', nombre: 'Conclusión de la obra o servicio (Art. 159 N° 5)', causal: '159-5', texto: armar(
    `SEGUNDO: El contrato de trabajo terminó por la conclusión del trabajo o servicio que le dio origen, lo que fue comunicado al trabajador por escrito.`) },
  { id: 'necesidades', nombre: 'Necesidades de la empresa (Art. 161)', causal: '161-1', texto: armar(
    `SEGUNDO: El empleador puso término al contrato de trabajo por necesidades de la empresa, fundado en los siguientes hechos: {{hechos}}. La carta de aviso fue entregada al trabajador con fecha {{fecha_aviso}}, con copia a la Inspección del Trabajo.`) },
  { id: 'desahucio', nombre: 'Desahucio del empleador (Art. 161 inc. 2°)', causal: '161-2', texto: armar(
    `SEGUNDO: El empleador puso término al contrato de trabajo mediante desahucio escrito, comunicado al trabajador con fecha {{fecha_aviso}}, atendido que el trabajador desempeñaba un cargo de exclusiva confianza con facultades generales de administración.`) },
  { id: 'generica', nombre: 'Genérica (cualquier causal)', causal: '', texto: armar(
    `SEGUNDO: El término del contrato se fundamenta en los siguientes hechos: {{hechos}}. La comunicación de término fue entregada al trabajador con fecha {{fecha_aviso}}.`) },
];
export const MARCADORES: [string, string][] = [
  ['empresa', 'Razón social del empleador'], ['rut_empresa', 'RUT del empleador'], ['domicilio_empresa', 'Domicilio del empleador'],
  ['representante', 'Representante legal'], ['rut_representante', 'RUT del representante'], ['ciudad', 'Ciudad de firma'],
  ['trabajador', 'Nombre del trabajador'], ['rut_trabajador', 'RUT del trabajador'], ['cargo', 'Cargo'],
  ['fecha_inicio', 'Fecha de inicio del contrato'], ['fecha_termino', 'Fecha de término'], ['fecha_finiquito', 'Fecha del finiquito (en palabras)'],
  ['fecha_aviso', 'Fecha de la carta de aviso o renuncia'], ['causal', 'Causal de término'], ['causal_articulo', 'Artículo de la causal'],
  ['hechos', 'Hechos que fundamentan la causal'], ['antiguedad', 'Antigüedad (años y meses)'], ['dias_feriado', 'Días de feriado pagados (corridos)'],
  ['anios_indemnizacion', 'Años pagados de indemnización'], ['ultima_remuneracion', 'Última remuneración (Art. 172)'],
  ['total', 'Total a pagar'], ['total_palabras', 'Total en palabras'], ['forma_pago', 'Forma de pago'], ['detalle', 'Tabla con el detalle de montos'],
];

// ── Fechas ──
const esFecha = (s: unknown): s is string => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const dUTC = (s: string) => new Date(s + 'T00:00:00Z');
const isoU = (d: Date) => d.toISOString().slice(0, 10);
const sumarDias = (s: string, n: number) => { const d = dUTC(s); d.setUTCDate(d.getUTCDate() + n); return isoU(d); };
const sumarMeses = (s: string, n: number) => { const [y, m, d] = s.split('-').map(Number); const fin = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate(); return isoU(new Date(Date.UTC(y, m - 1 + n, Math.min(d, fin)))); };
const diasEntre = (a: string, b: string) => Math.round((dUTC(b).getTime() - dUTC(a).getTime()) / 86400000);
const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const fechaLarga = (s: string | undefined) => { if (!esFecha(s)) return ''; const [y, m, d] = s.split('-').map(Number); return `${d} de ${MESES_L[m - 1]} de ${y}`; };
const fmtN = (n: number) => (+n || 0).toLocaleString('es-CL', { maximumFractionDigits: 2 });

/** Días hábiles de feriado → días corridos desde el día siguiente al término (suma sábados, domingos y festivos). */
export function habilesACorridos(fechaTermino: string, habiles: number, cfg: CfgFeriados = CFG_FERIADOS_VACIA) {
  let entero = Math.floor(+habiles || 0); const frac = +((+habiles || 0) - entero).toFixed(4);
  let d = fechaTermino, corridos = 0, inhabiles = 0, guard = 0;
  const esHabil = (s: string) => { const w = dUTC(s).getUTCDay(); return w >= 1 && w <= 5 && !esFeriado(s, cfg); };
  while (entero > 0 && guard < 4000) { d = sumarDias(d, 1); corridos++; if (esHabil(d)) entero--; else inhabiles++; guard++; }
  return { corridos: +(corridos + frac).toFixed(2), inhabiles, hasta: corridos ? d : fechaTermino };
}

/** Antigüedad: años, meses y días completos desde el inicio hasta el término (inclusive). */
export function antiguedad(inicio: string, termino: string) {
  const meses = mesesEntre(inicio, termino);
  const ancla = sumarMeses(inicio, meses);
  const dias = Math.max(0, diasEntre(ancla, sumarDias(termino, 1)));
  return { anios: Math.floor(meses / 12), meses: meses % 12, mesesTot: meses, dias };
}
/** Años de indemnización (Art. 163): años completos + 1 si la fracción supera seis meses. */
export function aniosIndemnizacion(inicio: string, termino: string) {
  const a = antiguedad(inicio, termino);
  if (a.mesesTot < 12) return { anios: 0, motivo: 'Menos de un año de contrato: no corresponde indemnización por años de servicio (Art. 163).', a } as { anios: number; motivo?: string; topeAplicado?: boolean; fraccionMayor6?: boolean; a: typeof a; aniosPagados?: number };
  const fraccionMayor6 = a.meses > 6 || (a.meses === 6 && a.dias > 0);
  const anios = a.anios + (fraccionMayor6 ? 1 : 0);
  return { anios: Math.min(MAX_ANIOS_IAS, anios), topeAplicado: anios > MAX_ANIOS_IAS, fraccionMayor6, a } as { anios: number; motivo?: string; topeAplicado?: boolean; fraccionMayor6?: boolean; a: typeof a; aniosPagados?: number };
}

/** Número escrito por la persona: null si está vacío (para distinguir "automático" de 0). */
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim(); if (s === '') return null;
  const n = decimalCL(s);
  return /\d/.test(s) && isFinite(n) ? n : null;
}

export interface FilaExtra { d: string; m: string | number }
export interface EntradaFiniquito {
  fechaTermino: string; causal: string; fechaAviso?: string; uf: number;
  incGrat?: boolean; incColacion?: boolean; incMovilizacion?: boolean; baseManual?: string | number;
  incMesTermino?: boolean; montoMesTermino?: string | number; diasFeriadoManual?: string | number; aniosManual?: string | number; afcManual?: string | number;
  haberesExtra?: FilaExtra[]; descuentosExtra?: FilaExtra[];
}
export interface LineaFin { k: string; d: string; m: number; exento?: boolean }
export interface ContextoFiniquito { ctx: ContextoRem; utm: number; feriados?: CfgFeriados }

export function calcularFiniquito(t: Trabajador, inp: EntradaFiniquito, { ctx, utm, feriados = CFG_FERIADOS_VACIA }: ContextoFiniquito) {
  const avisos: string[] = [];
  const c = causalInfo(inp.causal);
  const inicio = t.lre && t.lre.fechaInicio;
  const termino = inp.fechaTermino;
  if (!esFecha(inicio)) return { ok: false as const, motivo: 'Falta la fecha de inicio del contrato en la ficha del trabajador.' };
  if (!esFecha(termino)) return { ok: false as const, motivo: 'Indica la fecha de término.' };
  if (termino < inicio) return { ok: false as const, motivo: 'La fecha de término es anterior al inicio del contrato.' };
  const uf = +inp.uf;
  if (!(uf > 0)) return { ok: false as const, motivo: 'Indica la UF a la fecha de término.' };
  const t2: Trabajador = { ...t, lre: { ...(t.lre || {}), fechaTermino: termino } };
  const full = calcularLiquidacion(t2, uf, utm, undefined, ctx.P, ctx.libros); // mes completo, sin asistencia
  const ant = antiguedad(inicio, termino);

  // Remuneraciones de referencia
  const remIntegra = full.base + full.otros + (inp.incGrat !== false ? full.grat : 0);
  const r172Calc = full.base + full.otros + (inp.incGrat !== false ? full.grat : 0)
    + (inp.incColacion !== false ? full.colacion : 0) + (inp.incMovilizacion !== false ? full.movilizacion : 0);
  const ultimaRem = num(inp.baseManual) != null ? num(inp.baseManual)! : r172Calc;
  const tope90 = Math.round(TOPE_UF_ART172 * uf);
  const baseIndem = Math.min(ultimaRem, tope90);
  if (ultimaRem > tope90) avisos.push(`La última remuneración (${clp(ultimaRem)}) supera el tope de 90 UF: las indemnizaciones se calculan con ${clp(tope90)} (Art. 172).`);

  const lineas: LineaFin[] = [], desc: LineaFin[] = [];
  // 1. Remuneración pendiente del mes de término
  let mesTerm: { dias: number; liquido: number; monto: number } | null = null;
  if (inp.incMesTermino) {
    const [y, m] = termino.split('-').map(Number);
    const asis = asistenciaMes(t2, y, m, ctx.eventos, ctx.horas);
    const l = calcularLiquidacion(t2, uf, utm, asis, ctx.P, ctx.libros);
    const monto = num(inp.montoMesTermino) != null ? num(inp.montoMesTermino)! : l.liquido;
    mesTerm = { dias: asis ? asis.diasPagados : 30, liquido: l.liquido, monto };
    lineas.push({ k: 'mes', d: `Remuneración líquida pendiente (${mesTerm.dias} día(s) de ${MESES_L[m - 1]})`, m: monto });
  }
  // 2. Feriado pendiente y proporcional (Art. 73)
  const s = saldoVacaciones(t2, termino, ctx.eventos, feriados);
  let habiles = 0, habilesCalc = 0, fraccion = 0;
  if (s.ok) {
    fraccion = +((Math.min(30, ant.dias) / 30) * (s.anual / 12)).toFixed(2);
    habilesCalc = Math.max(0, +(s.saldo + fraccion).toFixed(2));
    if (s.saldo < 0) avisos.push(`El trabajador tiene ${String(Math.abs(s.saldo)).replace('.', ',')} día(s) de vacaciones tomados en exceso. No se descuentan automáticamente: agrégalos como descuento si corresponde.`);
  } else avisos.push('Feriado: ' + s.motivo);
  habiles = num(inp.diasFeriadoManual) != null ? Math.max(0, num(inp.diasFeriadoManual)!) : habilesCalc;
  const conv = habilesACorridos(termino, habiles, feriados);
  const diario = remIntegra / 30;
  const montoFeriado = Math.round(diario * conv.corridos);
  if (montoFeriado > 0) lineas.push({ k: 'feriado', d: `Feriado pendiente y proporcional (${fmtN(habiles)} días hábiles = ${fmtN(conv.corridos)} días corridos)`, m: montoFeriado, exento: true });

  // 3. Indemnización sustitutiva del aviso previo (Art. 161 y 162)
  let diasAviso: number | null = null, sustitutiva = 0;
  if (c.aviso === 'despido') {
    diasAviso = esFecha(inp.fechaAviso) ? diasEntre(inp.fechaAviso, termino) : null;
    if (diasAviso == null || diasAviso < 30) {
      sustitutiva = baseIndem;
      lineas.push({ k: 'aviso', d: 'Indemnización sustitutiva del aviso previo (Art. 161 y 162)', m: sustitutiva, exento: true });
    }
    if (diasAviso != null && diasAviso < 0) avisos.push('La fecha de aviso es posterior a la de término.');
  }
  // 4. Indemnización por años de servicio (Art. 163)
  let ias = 0, iasInfo: ReturnType<typeof aniosIndemnizacion> | null = null;
  if (c.ias) {
    iasInfo = aniosIndemnizacion(inicio, termino);
    const anios = num(inp.aniosManual) != null ? Math.max(0, Math.floor(num(inp.aniosManual)!)) : iasInfo.anios;
    iasInfo = { ...iasInfo, aniosPagados: anios };
    if (iasInfo.motivo && !anios) avisos.push(iasInfo.motivo);
    if (iasInfo.topeAplicado) avisos.push(`Antigüedad mayor a 11 años: se aplica el máximo legal de 330 días (Art. 163).`);
    ias = anios * baseIndem;
    if (ias > 0) lineas.push({ k: 'ias', d: `Indemnización por años de servicio (${anios} año(s) × ${clp(baseIndem)}, Art. 163)`, m: ias, exento: true });
  }
  (inp.haberesExtra || []).forEach((x) => { const m = Math.round(num(x.m) || 0); if (m && String(x.d || '').trim()) lineas.push({ k: 'extra', d: String(x.d).trim(), m }); });

  // Descuento del aporte del empleador al seguro de cesantía (Art. 13 Ley 19.728)
  let afc = 0, afcEstimado = 0;
  if (ias > 0) {
    if ((t.contrato || 'indefinido') === 'indefinido') {
      const desde = inicio > INICIO_AFC ? inicio : INICIO_AFC;
      const meses = desde <= termino ? mesesEntre(desde, termino) : 0;
      afcEstimado = Math.round(full.baseCes * TASA_AFC_CIC_EMPLEADOR * meses);
    }
    afc = num(inp.afcManual) != null ? Math.max(0, Math.round(num(inp.afcManual)!)) : afcEstimado;
    afc = Math.min(afc, ias);
    if (afc > 0) desc.push({ k: 'afc', d: 'Aporte del empleador al seguro de cesantía (Art. 13 Ley 19.728)', m: afc });
  }
  (inp.descuentosExtra || []).forEach((x) => { const m = Math.round(num(x.m) || 0); if (m && String(x.d || '').trim()) desc.push({ k: 'extra', d: String(x.d).trim(), m }); });

  const totalHaberes = lineas.reduce((a, x) => a + x.m, 0);
  const totalDescuentos = desc.reduce((a, x) => a + x.m, 0);
  const total = totalHaberes - totalDescuentos;
  if (total < 0) avisos.push('Los descuentos superan los haberes: el total queda negativo.');
  // Aviso propio de esta versión: un saldo de vacaciones sobre dos períodos suele ser falta de saldo inicial
  if (s.ok && s.excedeAcumulacion && num(inp.diasFeriadoManual) == null)
    avisos.push(`El saldo de vacaciones (${fmtN(s.saldo)} días hábiles) supera dos períodos. Si el trabajador tomó vacaciones antes de registrarlas aquí, ingresa su saldo inicial en la ficha o los días a mano.`);
  return {
    ok: true as const, causal: c, inicio, termino, uf, ant, remIntegra, r172Calc, ultimaRem, tope90, baseIndem,
    feriado: { saldo: s.ok ? s.saldo : null, fraccion, habilesCalc, habiles, corridos: conv.corridos, inhabiles: conv.inhabiles, hasta: conv.hasta, diario: Math.round(diario), monto: montoFeriado },
    mesTerm, diasAviso, sustitutiva, ias, iasInfo, afc, afcEstimado, lineas, desc, totalHaberes, totalDescuentos, total, avisos, baseCes: full.baseCes as number,
  };
}
export type ResultadoFiniquito = ReturnType<typeof calcularFiniquito>;
export type FiniquitoOk = Extract<ResultadoFiniquito, { ok: true }>;

// ── Texto ──
export interface DatosEmpresaDoc { nombre?: string; rut?: string; domicilio?: string; comuna?: string; ciudad?: string; rep?: string; rutrep?: string }
export interface DatosDocFiniquito { causal: string; numeral160?: string; fechaTermino: string; fecha?: string; fechaAviso?: string; hechos?: string; ciudad?: string; formaPago?: string; nombre?: string; rut?: string }

export function valoresMarcadores(f: DatosDocFiniquito, t: Pick<Trabajador, 'nombre' | 'rut' | 'cargo'> | null, r: FiniquitoOk | null, E: DatosEmpresaDoc): Record<string, string> {
  const c = causalInfo(f.causal);
  const n160 = c.numeral ? NUMERALES_160.find((x) => x[0] === f.numeral160) : null;
  const causalTxt = n160 ? n160[2] : c.nm.toLowerCase();
  const art = n160 ? `artículo 160 ${n160[1]}` : c.art;
  const ant = r ? r.ant : null;
  return {
    empresa: E.nombre || '', rut_empresa: E.rut || '',
    domicilio_empresa: [...new Set([E.domicilio, E.comuna, E.ciudad].map((x) => String(x || '').trim()).filter(Boolean))].join(', '),
    representante: E.rep || '', rut_representante: E.rutrep || '', ciudad: f.ciudad || E.ciudad || E.comuna || '',
    trabajador: t ? t.nombre : f.nombre || '', rut_trabajador: t ? t.rut || '' : f.rut || '', cargo: (t && t.cargo) || '',
    fecha_inicio: fechaLarga(r?.inicio), fecha_termino: fechaLarga(f.fechaTermino), fecha_finiquito: fechaLarga(f.fecha || f.fechaTermino),
    fecha_aviso: fechaLarga(f.fechaAviso) || '[fecha de aviso]', causal: causalTxt, causal_articulo: art,
    hechos: (f.hechos || '').trim() || '[indicar los hechos]',
    antiguedad: ant ? `${ant.anios} año(s) y ${ant.meses} mes(es)` : '',
    dias_feriado: r ? fmtN(r.feriado.corridos) : '',
    anios_indemnizacion: r && r.iasInfo ? String(r.iasInfo.aniosPagados) : '0',
    ultima_remuneracion: r ? clp(r.ultimaRem) : '',
    total: r ? clp(r.total) : '', total_palabras: r ? numeroALetras(r.total) : '',
    forma_pago: (f.formaPago || '').trim() || 'transferencia electrónica',
  };
}

/** Reemplaza marcadores; los desconocidos quedan a la vista. {{detalle}} se resuelve al dibujar. */
export function combinar(texto: string, vals: Record<string, string>) {
  return String(texto || '').replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (m, k: string) => { k = k.toLowerCase(); return k === 'detalle' ? m : (k in vals ? vals[k] : m); });
}
export function marcadoresPendientes(texto: string, vals: Record<string, string>) {
  return [...new Set((combinar(texto, vals).match(/\{\{\s*[a-z_]+\s*\}\}/gi) || []).filter((m) => !/detalle/i.test(m)))];
}
export function detalleTexto(r: Pick<FiniquitoOk, 'lineas' | 'desc' | 'total'>) {
  return [...r.lineas.map((x) => `${x.d}: ${clp(x.m)}`), ...r.desc.map((x) => `Menos ${x.d}: ${clp(x.m)}`), `Total a pagar: ${clp(r.total)}`].join('\n');
}

export type Bloque = { tipo: 'titulo'; texto: string } | { tipo: 'parrafo'; rotulo?: string; texto: string } | { tipo: 'detalle' };
/** Texto combinado → bloques para dibujar: 1ª línea en mayúsculas es título, "PRIMERO:" en negrita, {{detalle}} solo = tabla. */
export function bloquesDocumento(texto: string, vals: Record<string, string>, r: Pick<FiniquitoOk, 'lineas' | 'desc' | 'total'> | null): Bloque[] {
  const t = combinar(texto, vals);
  const partes = t.replace(/\r/g, '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return partes.map((b, i): Bloque => {
    if (/^\{\{\s*detalle\s*\}\}$/i.test(b)) return { tipo: 'detalle' };
    const b2 = b.replace(/\{\{\s*detalle\s*\}\}/gi, r ? detalleTexto(r) : '');
    if (i === 0 && b.length < 90 && b === b.toUpperCase()) return { tipo: 'titulo', texto: b2 };
    const m = b2.match(/^([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ]{2,30}:)/);
    return m ? { tipo: 'parrafo', rotulo: m[1], texto: b2.slice(m[1].length) } : { tipo: 'parrafo', texto: b2 };
  });
}

// ── Contabilización ──
export const CUENTAS_FIN: Record<string, { cd: string; lado: 'debe' | 'haber'; nm: string; prov?: string; ayuda?: string }> = {
  mes: { cd: '2104005', lado: 'debe', nm: 'Remuneración del mes de término', ayuda: 'Rebaja las remuneraciones por pagar del asiento mensual. Si el mes no se contabilizó, usa 3201001 Sueldos y salarios.' },
  feriado: { cd: '3201011', lado: 'debe', nm: 'Feriado pendiente y proporcional', prov: '2105004' },
  aviso: { cd: '3201009', lado: 'debe', nm: 'Indemnización sustitutiva del aviso previo', prov: '2202001' },
  ias: { cd: '3201009', lado: 'debe', nm: 'Indemnización por años de servicio', prov: '2202001' },
  extraH: { cd: '3201014', lado: 'debe', nm: 'Otros haberes del finiquito' },
  afc: { cd: '3201009', lado: 'haber', nm: 'Descuento aporte AFC del empleador', ayuda: 'Rebaja el gasto en indemnizaciones: esos aportes ya se contabilizaron mes a mes.' },
  extraD: { cd: '1106001', lado: 'haber', nm: 'Otros descuentos (anticipos, préstamos)' },
  pagar: { cd: '2104005', lado: 'haber', nm: 'Finiquito por pagar' },
};
export interface CfgAsientoFin { fecha: string; cc?: string; cuentas?: Record<string, string>; usarProv?: Record<string, boolean> }
export interface CuentaPlan { codigo: string; acepta_movimientos: boolean; acepta_centro_costo: boolean; tipo_auxiliar: string | null }
export interface MovFin { k: string; cuenta: string; debe: number; haber: number; glosa: string; rut_auxiliar?: string; centro_costo?: string }

/** Propuesta de asiento del finiquito (misma lógica que el sistema actual). `saldos`: saldo acreedor de las provisiones. */
export function propuestaAsiento(nombre: string, rut: string, r: FiniquitoOk, cfg: CfgAsientoFin, plan: Map<string, CuentaPlan>, saldos: Record<string, number>) {
  const errores: string[] = [], avisos: string[] = [], movs: MovFin[] = [];
  const cta = (k: string) => String((cfg.cuentas || {})[k] || CUENTAS_FIN[k].cd).trim();
  const add = (k: string, cd: string, monto: number, glosa: string, lado?: 'debe' | 'haber') => {
    monto = Math.round(monto); if (!monto) return;
    lado = lado || CUENTAS_FIN[k].lado;
    const c = plan.get(cd);
    const m: MovFin = { k, cuenta: cd, debe: lado === 'debe' ? monto : 0, haber: lado === 'haber' ? monto : 0, glosa };
    if (c?.tipo_auxiliar && rut) m.rut_auxiliar = rut;
    if (cfg.cc && c?.acepta_centro_costo) m.centro_costo = cfg.cc;
    movs.push(m);
  };
  const conProvision = (k: string, clave: string, monto: number, glosa: string) => {
    const prov = CUENTAS_FIN[k].prov;
    if (cfg.usarProv && cfg.usarProv[clave] && prov) {
      const disp = Math.max(0, (saldos[prov] || 0) - movs.filter((m) => m.cuenta === prov).reduce((s, m) => s + m.debe, 0));
      const usa = Math.min(disp, monto);
      if (usa > 0) add(k, prov, usa, glosa + ' (contra provisión)');
      if (monto - usa > 0) { add(k, cta(k), monto - usa, glosa); if (usa > 0) avisos.push(`La provisión ${prov} alcanza para ${clp(usa)}: el resto (${clp(monto - usa)}) va a gasto.`); }
      if (!disp) avisos.push(`La cuenta ${prov} no tiene saldo: ${glosa.toLowerCase()} va a gasto.`);
      return;
    }
    add(k, cta(k), monto, glosa);
  };
  const L = (k: string) => r.lineas.filter((x) => x.k === k).reduce((s, x) => s + x.m, 0);
  if (L('mes')) add('mes', cta('mes'), L('mes'), 'Remuneración pendiente ' + nombre);
  if (L('feriado')) conProvision('feriado', 'feriado', L('feriado'), 'Feriado proporcional ' + nombre);
  if (L('aviso')) conProvision('aviso', 'ias', L('aviso'), 'Indemnización sustitutiva aviso previo ' + nombre);
  if (L('ias')) conProvision('ias', 'ias', L('ias'), 'Indemnización años de servicio ' + nombre);
  r.lineas.filter((x) => x.k === 'extra').forEach((x) => add('extraH', cta('extraH'), x.m, x.d + ' ' + nombre));
  if (r.afc) {
    const dIas = movs.filter((m) => m.k === 'ias');
    const cdAfc = (cfg.cuentas || {}).afc ? cta('afc') : (dIas.length ? dIas[dIas.length - 1].cuenta : cta('afc'));
    add('afc', cdAfc, r.afc, 'Descuento aporte AFC empleador (Art. 13 Ley 19.728)');
  }
  r.desc.filter((x) => x.k === 'extra').forEach((x) => add('extraD', cta('extraD'), x.m, x.d + ' ' + nombre));
  if (r.total <= 0) errores.push('El total a pagar debe ser mayor que cero para contabilizar.');
  else add('pagar', cta('pagar'), r.total, 'Finiquito por pagar ' + nombre);
  const d = movs.reduce((s, m) => s + m.debe, 0), h = movs.reduce((s, m) => s + m.haber, 0);
  if (d !== h) errores.push(`Asiento descuadrado: Debe ${clp(d)} / Haber ${clp(h)}`);
  for (const m of movs) {
    const c = plan.get(m.cuenta);
    if (!c) errores.push(`La cuenta ${m.cuenta} no existe en el plan de cuentas.`);
    else if (!c.acepta_movimientos) errores.push(`La cuenta ${m.cuenta} es agrupadora: elige una cuenta de detalle.`);
    else if (c.tipo_auxiliar && !m.rut_auxiliar) errores.push(`La cuenta ${m.cuenta} requiere el RUT del trabajador.`);
  }
  if (!esFecha(cfg.fecha)) errores.push('Indica la fecha del asiento.');
  return { movs, errores, avisos, debe: d, haber: h };
}

// ── Plantillas de la empresa ──
export interface PlantillaGuardada { id: string; codigo: string; nombre: string; causal: string; texto: string }
/** Plantillas tipo (con su versión editada si existe) + las propias de la empresa. */
export function plantillasDisponibles(guardadas: PlantillaGuardada[]): (Plantilla & { uuid?: string })[] {
  const tipo = PLANTILLAS_TIPO.map((p) => { const ed = guardadas.find((x) => x.codigo === p.id); return ed ? { ...p, nombre: ed.nombre, texto: ed.texto, tipo: true, editada: true, uuid: ed.id } : { ...p, tipo: true }; });
  const propias = guardadas.filter((x) => !PLANTILLAS_TIPO.some((p) => p.id === x.codigo)).map((x) => ({ id: x.codigo, nombre: x.nombre, causal: x.causal, texto: x.texto, tipo: false, uuid: x.id }));
  return [...tipo, ...propias];
}
/** Texto efectivo: el propio del finiquito, la plantilla elegida o la de la causal. */
export function textoFiniquito(f: { texto?: string | null; plantillaId?: string; causal: string }, plantillas: Plantilla[]) {
  if (f.texto && String(f.texto).trim()) return f.texto;
  const por = (id?: string) => plantillas.find((p) => p.id === id);
  return (por(f.plantillaId) || por(causalInfo(f.causal).plantilla) || plantillas[0] || PLANTILLAS_TIPO[0]).texto;
}

export interface FormFiniquito extends EntradaFiniquito, DatosDocFiniquito {
  trab: string; numeral160?: string; plantillaId?: string; actualizarFicha?: boolean; codigoLRE?: string;
}
export const limpiarTexto = (t: string) => String(t || '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
