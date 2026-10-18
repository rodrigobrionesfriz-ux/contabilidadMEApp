// Formulario 29 mensual: traslado fiel de calcularF29Anual (tributario.js) del sistema actual.
// IVA débito y crédito por códigos, remanente reajustado por UTM (art. 27 DL 825),
// PPM, retención de honorarios e impuesto único. Si un período fue presentado,
// el arrastre al mes siguiente es el remanente DECLARADO (cód. 77).

import { clasificacionIVACompra, tributacionCompra, periodoContableCompra, type Documento } from '@/motor/contable';
import { dteC, dteV, esDteHonorario } from '@/motor/dte';
import { retencionHonorarios } from '@/importador/respaldo';
import { UTM_SII } from './utm';

export interface DeclaracionF29 {
  periodo: string;
  estado: 'borrador' | 'presentado' | 'cerrado' | string;
  declarado?: Record<string, number>;
  utm?: number | null;
  remanenteInicial?: number | null;
}

export interface VentaF29 { tipoDTE: number; fecha: string; neto?: number; exento?: number; iva?: number; total?: number; estado?: string; excluidoAuto?: boolean }
export interface HonorarioF29 { mes?: number; bruto?: number; retencion?: number | null; tasaRetencion?: number | null; tipoRetencion?: string; estado?: string }

export interface EntradaF29 {
  anio: number;
  /** Tasa PPM en porcentaje (1 = 1%) */
  tasaPPM: number;
  ventas: VentaF29[];
  compras: Documento[];
  honorarios: HonorarioF29[];
  /** Impuesto único de segunda categoría por período (YYYY-MM) */
  iusc: Record<string, number>;
  /** Declaraciones del año */
  declaraciones: Record<string, DeclaracionF29>;
  /** Declaraciones del año anterior (diciembre para el remanente inicial) */
  anteriores: Record<string, DeclaracionF29>;
  /** UTM conocida por período (sobrescribe la tabla del SII) */
  utmExtra?: Record<string, number>;
}

export interface MesF29 {
  m: number; ventasNetas: number; ventasExentas: number; debito: number; ivaRetenido: number; debitoTotal: number;
  comprasNetas: number; credito: number; creditoActivoFijo: number; creditoMes: number; ivaNoRecuperable: number;
  remanenteAnt: number; remanenteReaj: number; reajusteRemanente: number; remanenteSinUTM: boolean; utmRemanenteAnt: number;
  utmPeriodo: number; utmImputacion: number; remanenteUTM: number; creditoTotal: number; ivaDeterminado: number;
  ivaAPagar: number; remanente: number; basePPM: number; ppm: number; retencionHon: number; iusc: number; totalPagar: number;
  nDocsV: number; nDocsC: number; codigos: Record<number, number>;
  detalleVentas: ReturnType<typeof detalleVentas>; detalleCompras: ReturnType<typeof detalleCompras>;
  declaracion: DeclaracionF29 | null;
}

export const CODIGOS_DECLARABLES = [538, 39, 537, 504, 77, 89, 563, 62, 151, 48, 91] as const;
export const esPresentado = (d?: DeclaracionF29 | null) => !!(d && ['presentado', 'cerrado'].includes(d.estado));
const codDecl = (d: DeclaracionF29 | null | undefined, cod: number, def = 0) => {
  const v = d?.declarado?.[String(cod)];
  return v == null ? def : +v || 0;
};
export const periodoSiguiente = (p: string) => {
  const [y, m] = p.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};
export function reajustarRemanente(monto: number, utmOrigen: number, utmDestino: number) {
  if (!(monto > 0) || !(utmOrigen > 0) || !(utmDestino > 0)) return { monto, utm: 0, reajustado: false };
  const utm = Math.round((monto / utmOrigen) * 100) / 100;
  return { monto: Math.round(utm * utmDestino), utm, reajustado: true };
}

function detalleVentas(vs: VentaF29[]) {
  const r = { facturas: { n: 0, iva: 0 }, boletas: { n: 0, iva: 0 }, nd: { n: 0, iva: 0 }, nc: { n: 0, iva: 0 }, exentas: { n: 0, monto: 0 } };
  for (const d of vs) {
    const t = +d.tipoDTE, iva = Math.abs(+(d.iva ?? 0) || 0), ex = Math.abs(+(d.exento ?? 0) || 0);
    if (t === 33) { r.facturas.n++; r.facturas.iva += iva; }
    else if (t === 39) { r.boletas.n++; r.boletas.iva += iva; }
    else if (t === 56) { r.nd.n++; r.nd.iva += iva; }
    else if (t === 61) { r.nc.n++; r.nc.iva += iva; }
    else if (t === 34 || t === 41) { r.exentas.n++; r.exentas.monto += ex || Math.abs(+(d.total ?? 0) || 0); }
  }
  return r;
}

function detalleCompras(cs: Documento[]) {
  const r = { facturas: { n: 0, credito: 0 }, activoFijo: { n: 0, credito: 0 }, nd: { n: 0, credito: 0 }, nc: { n: 0, credito: 0 }, sinDerecho: { n: 0, neto: 0 }, exentas: { n: 0, monto: 0 } };
  for (const d of cs) {
    const t = +d.tipoDTE, ci = clasificacionIVACompra(d), rec = ci.recuperable;
    if (t === 61) { r.nc.n++; r.nc.credito += rec; continue; }
    if (t === 56) { r.nd.n++; r.nd.credito += rec; continue; }
    if (t === 32 || t === 34) { r.exentas.n++; r.exentas.monto += Math.abs(+(d.exento || d.total || 0)); continue; }
    if (ci.activoFijo > 0) { r.activoFijo.n++; r.activoFijo.credito += ci.activoFijo; }
    const creditoGiro = Math.max(0, rec - ci.activoFijo);
    if (creditoGiro > 0) { r.facturas.n++; r.facturas.credito += creditoGiro; }
    if (ci.noRecuperable > 0) { r.sinDerecho.n++; r.sinDerecho.neto += Math.abs(+(d.neto ?? 0)); }
  }
  return r;
}

export function calcularF29Anual(e: EntradaF29): MesF29[] {
  const { anio } = e;
  const decl = (p: string) => e.declaraciones[p] ?? null;
  const utmPeriodo = (p: string) => {
    const guardada = +((decl(p) ?? e.anteriores[p])?.utm ?? 0) || 0;
    if (guardada > 0) return guardada;
    if (+(e.utmExtra?.[p] ?? 0) > 0) return +e.utmExtra![p];
    const [y, m] = p.split('-').map(Number);
    return +(UTM_SII[y]?.[m - 1] ?? 0) || 0;
  };
  const utmDeclaracion = (p: string) => utmPeriodo(periodoSiguiente(p));

  // Remanente inicial: cód. 77 del F29 de diciembre anterior; si no, el ingresado en enero.
  const perDic = `${anio - 1}-12`, perEne = `${anio}-01`;
  const dic = e.anteriores[perDic] ?? null;
  let remanenteAnt = 0;
  if (dic && (esPresentado(dic) || dic.declarado?.['77'] != null)) remanenteAnt = Math.max(0, codDecl(dic, 77, 0));
  else if (decl(perEne)?.remanenteInicial != null) remanenteAnt = Math.max(0, +(decl(perEne)!.remanenteInicial ?? 0) || 0);
  let utmRemanenteAnt = remanenteAnt > 0 ? utmDeclaracion(perDic) : 0;

  const tasaPPM = (+e.tasaPPM || 0) / 100;
  const ventasVigentes = e.ventas.filter((d) => d.estado !== 'anulado');
  const comprasVigentes = e.compras.filter((d) => d.estado !== 'anulado');
  const meses: MesF29[] = [];
  for (let m = 1; m <= 12; m++) {
    const per = `${anio}-${String(m).padStart(2, '0')}`;
    const vs = ventasVigentes.filter((d) => d.fecha.slice(0, 4) === String(anio) && +d.fecha.slice(5, 7) === m);
    const vdet = detalleVentas(vs);
    let ventasNetas = 0, ventasExentas = 0, debito = 0;
    for (const d of vs) {
      const s = dteV(d.tipoDTE)?.signo || 1;
      ventasNetas += (d.neto || 0) * s; ventasExentas += (d.exento || 0) * s; debito += (d.iva || 0) * s;
    }
    const cs = comprasVigentes.filter((d) => !esDteHonorario(d.tipoDTE) && periodoContableCompra(d) === per);
    const cdet = detalleCompras(cs);
    let comprasNetas = 0, credito = 0, creditoActivoFijo = 0, ivaNoRecuperable = 0, ivaRetenido = 0;
    for (const d of cs) {
      const s = dteC(d.tipoDTE)?.signo || 1;
      comprasNetas += (d.neto || 0) * s;
      const ci = clasificacionIVACompra(d);
      credito += (ci.recuperable - ci.activoFijo) * s;
      creditoActivoFijo += ci.activoFijo * s;
      ivaNoRecuperable += ci.noRecuperable * s;
      const tc = tributacionCompra(d);
      if (tc.facturaCompra) ivaRetenido += tc.ivaRetenido * s;
    }
    const creditoMes = credito + creditoActivoFijo;
    const honM = e.honorarios.filter((h) => h.estado !== 'anulado' && h.mes === m);
    const retencionHon = Math.round(honM.reduce((s, h) => s + (h.retencion != null
      ? Math.abs(+h.retencion || 0)
      : Math.round(Math.abs(+(h.bruto ?? 0) || 0) * (h.tasaRetencion != null ? +h.tasaRetencion : retencionHonorarios(anio)))), 0));
    const iusc = Math.max(0, Math.round(e.iusc[per] ?? 0));
    const utmP = utmPeriodo(per);
    const utmImputacion = utmDeclaracion(per);
    const rr = reajustarRemanente(remanenteAnt, utmRemanenteAnt, utmImputacion);
    const remanenteReaj = rr.monto, remanenteUTM = rr.utm;
    const reajusteRemanente = remanenteReaj - remanenteAnt;
    const remanenteSinUTM = remanenteAnt > 0 && !rr.reajustado;
    const creditoTotal = creditoMes + remanenteReaj;
    const debitoTotal = debito + ivaRetenido;
    const ivaDeterminado = debitoTotal - creditoTotal;
    const ivaAPagar = ivaDeterminado > 0 ? ivaDeterminado : 0;
    const remanente = ivaDeterminado < 0 ? -ivaDeterminado : 0;
    const basePPM = ventasNetas + ventasExentas;
    const ppm = Math.round(basePPM * tasaPPM);
    const totalPagar = ivaAPagar + ppm + retencionHon + iusc;
    const codigos: Record<number, number> = {
      503: vdet.facturas.n, 502: vdet.facturas.iva, 110: vdet.boletas.n, 111: vdet.boletas.iva,
      512: vdet.nd.n, 513: vdet.nd.iva, 509: vdet.nc.n, 510: vdet.nc.iva, 586: vdet.exentas.n, 142: vdet.exentas.monto,
      538: debito,
      519: cdet.facturas.n, 520: cdet.facturas.credito, 524: cdet.activoFijo.n, 525: cdet.activoFijo.credito,
      527: cdet.nc.n, 528: cdet.nc.credito, 531: cdet.nd.n, 532: cdet.nd.credito,
      564: cdet.sinDerecho.n, 521: cdet.sinDerecho.neto, 584: cdet.exentas.n, 562: cdet.exentas.monto,
      504: remanenteReaj, 537: creditoTotal, 77: remanente, 89: ivaAPagar,
      563: basePPM, 62: ppm, 151: retencionHon, 48: iusc, 91: totalPagar, 39: ivaRetenido,
    };
    const d = decl(per);
    meses.push({ m, ventasNetas, ventasExentas, debito, ivaRetenido, debitoTotal, comprasNetas, credito, creditoActivoFijo, creditoMes,
      ivaNoRecuperable, remanenteAnt, remanenteReaj, reajusteRemanente, remanenteSinUTM, utmRemanenteAnt, utmPeriodo: utmP, utmImputacion,
      remanenteUTM, creditoTotal, ivaDeterminado, ivaAPagar, remanente, basePPM, ppm, retencionHon, iusc, totalPagar,
      nDocsV: vs.length, nDocsC: cs.length, codigos, detalleVentas: vdet, detalleCompras: cdet, declaracion: d || null });
    remanenteAnt = esPresentado(d) ? codDecl(d, 77, remanente) : remanente;
    utmRemanenteAnt = utmImputacion;
  }
  return meses;
}

/** Diferencias entre lo calculado y lo declarado (códigos declarables). */
export function diferenciasF29(m: MesF29, d: DeclaracionF29 | null) {
  if (!d?.declarado) return [];
  return CODIGOS_DECLARABLES.filter((c) => d.declarado![String(c)] != null && Math.round(+d.declarado![String(c)]) !== Math.round(m.codigos[c] ?? 0))
    .map((c) => ({ codigo: c, calculado: m.codigos[c] ?? 0, declarado: +d.declarado![String(c)] }));
}
