// Liquidación de sueldo: traslado fiel de remuneraciones.js, asistencia.js, anticipos.js,
// indicadores.js y previsional.js del sistema actual. Los parámetros llegan como argumento.

import { iuscTabla, SEGURO_SOCIAL_SIS_CEV, SIS_A_SEGURO_SOCIAL_DESDE, type Parametros, type TramoIUSC } from './parametros';

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface FichaLRE {
  fechaInicio?: string; fechaTermino?: string; causalTermino?: string; region?: string; comuna?: string; tipoImpuesto?: string;
  jornada?: string; discapacidad?: string; pensionadoVejez?: string; tecnicoExtranjero?: string;
  apvIndividual?: string; apvColectivo?: string; indemnizacionTodoEvento?: string; otrosCodigo?: string;
  cargasLegales?: string; cargasMaternales?: string; cargasInvalidez?: string; tramoAsignacion?: string;
  puestoPesado?: string; nombrePuestoPesado?: string; rentaMinima?: string; [k: string]: any;
}

export interface Trabajador {
  id: string; nombre: string; rut: string; cargo?: string;
  apellidoPaterno?: string; apellidoMaterno?: string; nombres?: string; sexo?: string; nacionalidad?: string;
  tipoTrabajador?: string; numeroFUN?: string;
  base?: number; tipoPago?: 'mensual' | 'hora'; valorHora?: number; horasMes?: number;
  gratifModo?: 'pct' | 'monto'; gratifPct?: number | string | null; grat?: number; otros?: number;
  colacion?: number; movilizacion?: number; afp?: string; salud?: string; plan?: number;
  contrato?: 'indefinido' | 'plazo' | 'indefinido11' | string;
  lre?: FichaLRE;
  anticipos?: Anticipo[];
  [k: string]: any;
}

export interface EventoAsistencia { id?: string; trab: string; tipo: string; licTipo?: string; desde: string; hasta?: string; folio?: string; obs?: string }
export interface Anticipo { id?: string; fecha: string; monto: number; motivo?: string; mesDesc?: string }
export type LibrosRem = Record<string, { lineas?: { id: string; totalImponible?: number }[] } | undefined>;

export interface ContextoRem {
  P: Parametros;
  eventos: EventoAsistencia[];
  horas: Record<string, Record<string, number>>;
  libros: LibrosRem;
}

// ── Asistencia (mes comercial de 30 días) ──
const PRIORIDAD = ['contrato', 'licencia', 'permiso_sin', 'ausencia', 'permiso_con', 'vacaciones'];
export const TIPOS_EVENTO = [
  { k: 'licencia', nm: 'Licencia médica', descuenta: true },
  { k: 'permiso_sin', nm: 'Permiso sin goce de sueldo', descuenta: true },
  { k: 'ausencia', nm: 'Ausencia injustificada', descuenta: true },
  { k: 'permiso_con', nm: 'Permiso con goce de sueldo', descuenta: false },
  { k: 'vacaciones', nm: 'Vacaciones (feriado legal)', descuenta: false },
];
export const TIPOS_LICENCIA = [
  { k: '1', nm: 'Tipo 1 · Enfermedad o accidente común' }, { k: '2', nm: 'Tipo 2 · Prórroga de medicina preventiva' },
  { k: '3', nm: 'Tipo 3 · Pre y postnatal' }, { k: '4', nm: 'Tipo 4 · Enfermedad grave del niño menor de 1 año' },
  { k: '5', nm: 'Tipo 5 · Accidente del trabajo o de trayecto' }, { k: '6', nm: 'Tipo 6 · Enfermedad profesional' },
  { k: '7', nm: 'Tipo 7 · Patología del embarazo' }, { k: 'sanna', nm: 'Ley SANNA · Hijo/a con enfermedad grave' },
];
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const diasDelMes = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const esFecha = (f: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(f || ''));
const sumarDias = (f: string, n: number) => { const d = new Date(f + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export function asistenciaMes(t: Trabajador, anio: number, mes: number, eventosTodos: EventoAsistencia[], horasPorPeriodo: ContextoRem['horas']) {
  const y = +anio, m = +mes, dm = diasDelMes(y, m);
  const ini = iso(y, m, 1), fin = iso(y, m, dm);
  const dia: (string | null)[] = new Array(dm + 1).fill(null);
  const marcar = (desde: string, hasta: string | undefined, tipo: string) => {
    if (!esFecha(desde)) return;
    const h = esFecha(hasta) && hasta! >= desde ? hasta! : desde;
    if (h < ini || desde > fin) return;
    const a = desde < ini ? 1 : +desde.slice(8, 10), b = h > fin ? dm : +h.slice(8, 10);
    for (let d = a; d <= b; d++) {
      const actual = dia[d];
      if (actual === null || PRIORIDAD.indexOf(tipo) < PRIORIDAD.indexOf(actual)) dia[d] = tipo;
    }
  };
  const lre = t.lre || {};
  if (esFecha(lre.fechaInicio) && lre.fechaInicio! > ini) marcar(ini, sumarDias(lre.fechaInicio!, -1), 'contrato');
  if (esFecha(lre.fechaTermino) && lre.fechaTermino! < fin) marcar(sumarDias(lre.fechaTermino!, 1), fin, 'contrato');
  const eventos = eventosTodos.filter((e) => e.trab === t.id && esFecha(e.desde) && (e.hasta || e.desde) >= ini && e.desde <= fin);
  eventos.forEach((e) => marcar(e.desde, e.hasta, e.tipo));
  const cuenta: Record<string, number> = { contrato: 0, licencia: 0, permiso_sin: 0, ausencia: 0, permiso_con: 0, vacaciones: 0 };
  for (let d = 1; d <= dm; d++) if (dia[d]) cuenta[dia[d]!]++;
  const ultimo = dia[dm];
  if (ultimo && dm !== 30) cuenta[ultimo] = Math.max(0, cuenta[ultimo] + (30 - dm));
  const noPagados = Math.min(30, cuenta.contrato + cuenta.licencia + cuenta.permiso_sin + cuenta.ausencia);
  const diasPagados = 30 - noPagados;
  const porHora = t.tipoPago === 'hora';
  const per = `${y}-${String(m).padStart(2, '0')}`;
  const hGuardada = horasPorPeriodo[per]?.[t.id];
  const horas = porHora ? (hGuardada != null ? +hGuardada : +(t.horasMes || 0)) : null;
  return {
    periodo: per, diasPagados, factor: diasPagados / 30,
    diasLicencia: cuenta.licencia, diasPermisoSin: cuenta.permiso_sin, diasAusencia: cuenta.ausencia,
    diasPermisoCon: cuenta.permiso_con, diasVacaciones: cuenta.vacaciones, diasFueraContrato: cuenta.contrato,
    diasNoPagados: noPagados, porHora, horas, horasIngresadas: porHora && hGuardada != null,
    eventos, completo: noPagados === 0,
  };
}
export type Asistencia = ReturnType<typeof asistenciaMes>;

// ── Impuesto único, gratificación, asignación familiar, trabajo pesado ──
export function calcularIUSCDetalle(baseTributable: number, utm: number, tabla: TramoIUSC[]) {
  const tb = tabla;
  const base = +baseTributable || 0;
  if (!utm || utm <= 0 || base <= 0) return { impuesto: 0, tramo: null as TramoIUSC | null, idx: -1, baseUTM: 0, factor: 0, rebaja: 0 };
  const baseUTM = base / utm;
  let idx = tb.findIndex((x) => baseUTM > x.desde && baseUTM <= x.hasta);
  if (idx < 0) idx = baseUTM <= (tb[0]?.hasta ?? 0) ? 0 : tb.length - 1;
  const t = tb[idx];
  const rebaja = (+t.rebajaUTM || 0) * utm;
  const impuesto = Math.max(0, Math.round(base * (+t.factor || 0) - rebaja));
  return { impuesto, tramo: t, idx, baseUTM, factor: +t.factor || 0, rebaja };
}
export const topeGratificacionMensual = (P: Parametros) => Math.round(((+P.ind.gratifTopeIMM || 0) * (+P.ind.ingresoMinimo || 0)) / 12);
export function calcularGratificacion(baseImponible: number, pct: unknown, P: Parametros) {
  const p = pct === '' || pct == null || isNaN(+(pct as number)) ? +P.ind.gratifPct || 0 : +(pct as number);
  const bruta = Math.round((Math.max(0, +baseImponible || 0) * p) / 100);
  const tope = topeGratificacionMensual(P);
  const monto = tope > 0 ? Math.min(bruta, tope) : bruta;
  return { pct: p, bruta, tope, monto, topeAplicado: tope > 0 && bruta > tope };
}
export function tramoAsignacionFamiliar(ingreso: number, P: Parametros) {
  const r = +ingreso || 0, i = P.ind;
  if (r <= +i.asigFamA_hasta) return 'A';
  if (r <= +i.asigFamB_hasta) return 'B';
  if (r <= +i.asigFamC_hasta) return 'C';
  return 'D';
}
export const montoAsignacionTramo = (tramo: string, P: Parametros) =>
  tramo === 'A' ? +P.ind.asigFamA_monto || 0 : tramo === 'B' ? +P.ind.asigFamB_monto || 0 : tramo === 'C' ? +P.ind.asigFamC_monto || 0 : 0;
export function tasasTrabajoPesado(calif: string, P: Parametros) {
  if (calif === 'pesado') return { emp: +P.ind.tpPesadoEmp || 0, trab: +P.ind.tpPesadoTrab || 0 };
  if (calif === 'menos') return { emp: +P.ind.tpMenosEmp || 0, trab: +P.ind.tpMenosTrab || 0 };
  return { emp: 0, trab: 0 };
}
export function gratificacionModo(t: Trabajador) {
  if (t.gratifModo === 'pct' || t.gratifModo === 'monto') return t.gratifModo;
  return t.gratifPct != null && t.gratifPct !== '' ? 'pct' : 'monto';
}
export function rentaMinimaDe(t: Trabajador, P: Parametros) {
  const k = (t.lre && t.lre.rentaMinima) || 'general';
  if (k === 'especial') return { k, nm: 'para menores de 18 y mayores de 65', monto: +P.ind.rentaMinimaEspecial || 0 };
  if (k === 'casa') return { k, nm: 'de casa particular', monto: +P.ind.rentaMinimaCasa || 0 };
  return { k: 'general', nm: '(ingreso mínimo)', monto: +P.ind.ingresoMinimo || 0 };
}
export function cargasFamiliares(t: Trabajador) {
  const l = t.lre || {};
  const s = Math.max(0, Math.floor(+(l.cargasLegales ?? 0) || 0)), m = Math.max(0, Math.floor(+(l.cargasMaternales ?? 0) || 0)), i = Math.max(0, Math.floor(+(l.cargasInvalidez ?? 0) || 0));
  return { simples: s, maternales: m, invalidas: i, total: s + m + i, equivalentes: s + m + 2 * i };
}
export function ingresoSemestreAnterior(t: Trabajador, periodo: string | undefined, libros: LibrosRem) {
  if (!/^\d{4}-\d{2}$/.test(periodo || '')) return null;
  const [y, m] = periodo!.split('-').map(Number);
  const meses = m >= 7 ? [1, 2, 3, 4, 5, 6].map((x) => `${y}-${String(x).padStart(2, '0')}`) : [7, 8, 9, 10, 11, 12].map((x) => `${y - 1}-${String(x).padStart(2, '0')}`);
  const vals = meses.map((p) => { const L = libros[p]; const ln = L && Array.isArray(L.lineas) ? L.lineas.find((x) => x.id === t.id) : null; return ln ? +(ln.totalImponible ?? 0) || 0 : 0; }).filter((v) => v > 0);
  if (!vals.length) return null;
  return { promedio: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length), meses: vals.length };
}
export function asignacionFamiliar(t: Trabajador, { totalImponible, factor = 1, dias = 30, periodo }: { totalImponible: number; factor?: number; dias?: number; periodo?: string }, P: Parametros, libros: LibrosRem) {
  const c = cargasFamiliares(t);
  const manual = String((t.lre && t.lre.tramoAsignacion) || '').toUpperCase();
  let ingreso: number, fuente: string;
  const hist = ingresoSemestreAnterior(t, periodo, libros);
  if (hist) { ingreso = hist.promedio; fuente = `promedio semestre anterior (${hist.meses} mes${hist.meses > 1 ? 'es' : ''})`; }
  else { ingreso = factor > 0 && factor < 1 ? Math.round(totalImponible / factor) : totalImponible; fuente = 'renta imponible del mes'; }
  const tramoIngreso = /^[ABCD]$/.test(manual) ? manual : tramoAsignacionFamiliar(ingreso, P);
  const tramo = c.equivalentes ? tramoIngreso : 'D';
  const valor = montoAsignacionTramo(tramo, P);
  const completo = valor * c.equivalentes;
  const d = Math.max(0, Math.min(30, +dias || 0));
  const monto = c.equivalentes ? Math.round(d >= 25 ? completo : (completo / 30) * d) : 0;
  return { tramo, tramoIngreso, manual: /^[ABCD]$/.test(manual), ingreso, fuente, valor, cargas: c, dias: d, proporcional: d < 25, monto };
}

// ── Previsional ──
const buscar = <T extends { k: string }>(lista: T[], k: string | undefined) => lista.find((a) => a.k === k) || lista[0];
export const afpInfo = (k: string | undefined, P: Parametros) => buscar(P.afps, k);
export const isapreInfo = (k: string | undefined, P: Parametros) => buscar(P.isapres, k);
export const mutualInfo = (k: string | undefined, P: Parametros) => buscar(P.mutuales, k);
export const cajaInfo = (k: string | undefined, P: Parametros) => buscar(P.cajas, k);
export const CONTRATOS_AFC = [
  { k: 'indefinido', nm: 'Indefinido' }, { k: 'plazo', nm: 'Plazo fijo / obra o faena' }, { k: 'indefinido11', nm: 'Indefinido, más de 11 años' },
];
export const aplicaSISyReforma = (t: Trabajador) => !t.tipoTrabajador || String(t.tipoTrabajador) === '0';
export function reformaVigente(periodo: string | undefined, P: Parametros, hoy = new Date().toISOString().slice(0, 7)) {
  const p = P.patronal;
  const per = /^\d{4}-\d{2}$/.test(String(periodo || '')) ? periodo! : hoy;
  const t = P.reforma.filter((x) => x.desde <= per).pop();
  if (!t) return { desde: null as string | null, capInd: 0, cev: 0, crp: 0, cevAuto: false };
  const auto = t.cev === null || t.cev === undefined || (t.cev as unknown) === '';
  const cev = auto ? Math.max(0, +(SEGURO_SOCIAL_SIS_CEV - (+p.sis || 0)).toFixed(4)) : +t.cev! || 0;
  return { desde: t.desde, capInd: +t.capInd || 0, cev, crp: +t.crp || 0, cevAuto: auto };
}
export function tasasAFC(contrato: string, P: Parametros) {
  const p = P.patronal;
  if (contrato === 'plazo') return { trab: +p.afcTrabPlazoFijo || 0, emp: +p.afcPlazoFijo || 0 };
  if (contrato === 'indefinido11') return { trab: +p.afcTrabIndef11 || 0, emp: +p.afcIndef11 || 0 };
  return { trab: +p.afcTrabIndefinido || 0, emp: +p.afcIndefinido || 0 };
}
export function tasaAccidentes(P: Parametros) {
  const p = P.patronal;
  const pre = p.mutualInstitucion === 'isl' ? 'isl' : 'mutual';
  return ['Base', 'Adicional', 'Sanna', 'Extra'].reduce((s, k) => s + (+p[pre + k] || 0), 0);
}
export function calcularAportePatronal(t: Trabajador, baseImponible: number, baseCesantia: number, bases: { sis?: number; afc?: number; periodo?: string } | undefined, P: Parametros) {
  const p = P.patronal;
  const R = (n: number) => Math.round(n || 0);
  const baseSIS = bases && bases.sis != null ? bases.sis : baseImponible;
  if (bases && bases.afc != null) baseCesantia = bases.afc;
  const activo = aplicaSISyReforma(t);
  const sis = activo ? R((baseSIS * +p.sis) / 100) : 0;
  const rf = reformaVigente(bases && bases.periodo, P);
  const capInd = activo ? R((baseImponible * rf.capInd) / 100) : 0;
  const cev = activo ? R((baseSIS * rf.cev) / 100) : 0;
  const crp = activo ? R((baseImponible * rf.crp) / 100) : 0;
  const ssAFP = !bases || !bases.periodo || bases.periodo < SIS_A_SEGURO_SOCIAL_DESDE;
  const mutualTasa = tasaAccidentes(P);
  const mutual = R((baseImponible * mutualTasa) / 100);
  const afcTasa = tasasAFC(t.contrato || 'indefinido', P).emp;
  const afc = R((baseCesantia * afcTasa) / 100);
  const caja = R((baseImponible * (+p.cajaCompensacion || 0)) / 100);
  const total = sis + mutual + afc + caja + capInd + cev + crp;
  return {
    sis, mutual, afc, caja, capInd, cev, crp, total, mutualTasa, afcTasa, reforma: rf, trabPesado: 0,
    detalle: [
      { concepto: 'SIS (invalidez y sobrevivencia)', tasa: activo ? +p.sis : 0, monto: sis, institucion: ssAFP ? 'AFP del trabajador' : 'Seguro Social Previsional' },
      ...(rf.capInd || capInd ? [{ concepto: 'Reforma: capitalización individual', tasa: activo ? rf.capInd : 0, monto: capInd, institucion: 'AFP del trabajador' }] : []),
      ...(rf.cev || cev ? [{ concepto: 'Seguro Social Previsional (expectativa de vida)', tasa: activo ? rf.cev : 0, monto: cev, institucion: 'Seguro Social Previsional' }] : []),
      ...(rf.crp || crp ? [{ concepto: 'Reforma: rentabilidad protegida (CRP)', tasa: activo ? rf.crp : 0, monto: crp, institucion: 'Seguro Social Previsional' }] : []),
      { concepto: p.mutualInstitucion === 'isl' ? 'ISL (Ley 16.744)' : 'Mutual (Ley 16.744)', tasa: mutualTasa, monto: mutual, institucion: mutualInfo(String(p.mutualInstitucion), P).nm },
      { concepto: `Seguro cesantía (${(CONTRATOS_AFC.find((c) => c.k === (t.contrato || 'indefinido')) || CONTRATOS_AFC[0]).nm.toLowerCase()})`, tasa: afcTasa, monto: afc, institucion: 'AFC Chile' },
      ...(caja > 0 ? [{ concepto: 'Caja de compensación', tasa: +p.cajaCompensacion, monto: caja, institucion: cajaInfo(String(p.cajaInstitucion), P).nm }] : []),
    ],
  };
}

// ── Liquidación ──
export function calcularLiquidacion(t: Trabajador, uf: number, utm: number, asis: Asistencia | undefined, P: Parametros, libros: LibrosRem): any {
  const I = P.ind;
  const REM = { topeAFP_UF: +I.topeAFP_UF, topeCesantia_UF: +I.topeCesantia_UF, tasaAFP: +I.tasaAFP / 100, tasaSalud: +I.tasaSalud / 100 };
  const porHora = t.tipoPago === 'hora';
  const factor = asis ? Math.max(0, Math.min(1, +asis.factor)) : 1;
  const horas = porHora ? (asis && asis.horas != null ? +asis.horas : +(t.horasMes || 0)) : null;
  const baseContrato = porHora ? Math.round((+(t.valorHora || 0)) * (horas || 0)) : +(t.base || 0);
  const base = porHora ? baseContrato : Math.round(+(t.base || 0) * factor);
  const otros = Math.round(+(t.otros || 0) * factor);
  const colacion = Math.round(+(t.colacion || 0) * factor), movilizacion = Math.round(+(t.movilizacion || 0) * factor);
  const gratModo = gratificacionModo(t);
  let grat = 0;
  let gratInfo: ReturnType<typeof calcularGratificacion> | null = null;
  if (gratModo === 'pct') {
    gratInfo = calcularGratificacion(base + otros, t.gratifPct, P);
    if (factor < 1 && gratInfo.tope > 0) {
      const tope = Math.round(gratInfo.tope * factor);
      gratInfo = { ...gratInfo, tope, monto: Math.min(gratInfo.bruta, tope), topeAplicado: gratInfo.bruta > tope };
    }
    grat = gratInfo.monto;
  } else grat = Math.round(+(t.grat || 0) * factor);
  const totalImponible = base + grat + otros;
  const af = asignacionFamiliar(t, { totalImponible, factor, dias: asis ? asis.diasPagados : 30, periodo: asis && asis.periodo }, P, libros);
  const asigFamiliar = af.monto;
  const totalNoImponible = colacion + movilizacion + asigFamiliar;
  const totalHaberes = totalImponible + totalNoImponible;
  const topeAFP = Math.round(REM.topeAFP_UF * uf * factor);
  const topeCes = Math.round(REM.topeCesantia_UF * uf * factor);
  const baseAFP = Math.min(totalImponible, topeAFP);
  const baseCes = Math.min(totalImponible, topeCes);
  const afp = afpInfo(t.afp, P);
  const descAFP = Math.round(baseAFP * (REM.tasaAFP + (afp.comision ?? 0) / 100));
  const descAFP_pension = Math.round(baseAFP * REM.tasaAFP);
  const descAFP_comision = descAFP - descAFP_pension;
  const saludLegal = Math.round(baseAFP * REM.tasaSalud);
  let adicionalIsapre = 0;
  if (t.salud && t.salud !== 'fonasa' && t.plan) {
    const planPesos = Math.round((+t.plan || 0) * uf);
    adicionalIsapre = Math.max(0, planPesos - saludLegal);
  }
  const descSalud = saludLegal + adicionalIsapre;
  const planUF = +(t.plan || 0) || 0;
  const planPesos = planUF ? Math.round(planUF * uf) : 0;
  const tasaCesTrab = tasasAFC(t.contrato || 'indefinido', P).trab;
  const descCesantia = Math.round((baseCes * tasaCesTrab) / 100);
  const califPesado = (t.lre && t.lre.puestoPesado) || '';
  const tasasTP = tasasTrabajoPesado(califPesado, P);
  const totalTrabPesado = Math.round((baseAFP * (tasasTP.trab + tasasTP.emp)) / 100);
  const descTrabPesado = Math.round((baseAFP * tasasTP.trab) / 100);
  const aporteTrabPesado = totalTrabPesado - descTrabPesado;
  const totalPrevisional = descAFP + descSalud + descCesantia + descTrabPesado;
  // Para el impuesto la salud (7% más adicional Isapre) se rebaja con tope del 7% del tope imponible en UF (SII).
  const topeSaludTrib = Math.round(REM.topeAFP_UF * REM.tasaSalud * uf * factor);
  const saludTributable = Math.min(descSalud, Math.max(saludLegal, topeSaludTrib));
  const baseTributable = totalImponible - (totalPrevisional - descSalud + saludTributable);
  const iuscDet = calcularIUSCDetalle(baseTributable, utm, iuscTabla(P));
  const iusc = iuscDet.impuesto;
  const totalDescuentos = totalPrevisional + iusc;
  const liquido = totalHaberes - totalDescuentos;
  let baseSIS = baseAFP, baseAFC = baseCes;
  const diasLic = asis ? +asis.diasLicencia || 0 : 0;
  if (diasLic > 0 && factor < 1) {
    const full = porHora ? null : calcularLiquidacion(t, uf, utm, undefined, P, libros);
    const impFull = full ? full.totalImponible : totalImponible;
    const extra = Math.round((impFull * Math.min(30, diasLic)) / 30);
    baseSIS = Math.min(Math.round(REM.topeAFP_UF * uf), baseAFP + extra);
    baseAFC = Math.min(Math.round(REM.topeCesantia_UF * uf), baseCes + extra);
  }
  const patronal = calcularAportePatronal(t, baseAFP, baseCes, { sis: baseSIS, afc: baseAFC, periodo: asis && asis.periodo }, P);
  if (aporteTrabPesado > 0) {
    patronal.trabPesado = aporteTrabPesado; patronal.total += aporteTrabPesado;
    patronal.detalle.push({ concepto: `Trabajo ${califPesado === 'pesado' ? 'pesado' : 'menos pesado'} (Ley 19.404)`, tasa: tasasTP.emp, monto: aporteTrabPesado, institucion: 'AFP del trabajador' });
  } else patronal.trabPesado = 0;
  const costoEmpresa = totalHaberes - asigFamiliar + patronal.total;
  return {
    patronal, costoEmpresa, base, baseContrato, otros, colacion, movilizacion, porHora, horas, valorHora: porHora ? +(t.valorHora || 0) : null,
    factor, asis: asis || null, tasaCesTrab, grat, gratModo, gratInfo,
    totalImponible, totalNoImponible, totalHaberes, baseAFP, baseCes, baseSIS, baseAFC,
    descAFP, descAFP_pension, descAFP_comision, descSalud, saludLegal, adicionalIsapre, planUF, planPesos, descCesantia,
    asigFamiliar, af, descTrabPesado, aporteTrabPesado, califPesado, tasasTP,
    totalPrevisional, baseTributable, iusc, iuscDet, totalDescuentos, liquido,
    afpNm: afp.nm, saludNm: t.salud && t.salud !== 'fonasa' ? isapreInfo(t.salud, P).nm : 'Fonasa',
  };
}

// ── Anticipos ──
const n = (v: unknown) => Math.round(+(v as number) || 0);
const mesDescDe = (a: Anticipo) => a.mesDesc || String(a.fecha || '').slice(0, 7);
export function anticiposMes(t: Trabajador, anio: number, mes: number) {
  const p = `${anio}-${String(mes).padStart(2, '0')}`;
  return (Array.isArray(t && t.anticipos) ? t.anticipos! : []).filter((a) => a && n(a.monto) > 0 && mesDescDe(a) === p)
    .sort((x, y) => String(x.fecha).localeCompare(String(y.fecha)));
}
export function aplicarAnticipos(l: any, lista: Anticipo[]) {
  const anticipo = (lista || []).reduce((s, a) => s + n(a.monto), 0);
  l.anticipos = (lista || []).map((a) => ({ id: a.id, fecha: a.fecha, monto: n(a.monto), motivo: a.motivo || '' }));
  l.anticipo = anticipo;
  if (anticipo) { l.totalDescuentos += anticipo; l.liquido -= anticipo; }
  return l;
}

export function liquidacionMes(t: Trabajador, uf: number, utm: number, anio: number, mes: number, ctx: ContextoRem) {
  return aplicarAnticipos(
    calcularLiquidacion(t, uf, utm, asistenciaMes(t, anio, mes, ctx.eventos, ctx.horas), ctx.P, ctx.libros),
    anticiposMes(t, anio, mes),
  );
}
export type Liquidacion = ReturnType<typeof liquidacionMes>;
