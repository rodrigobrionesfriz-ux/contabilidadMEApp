// Motor contable: traslado fiel de motor-contable.js (V2.21.70) a TypeScript.
// Los módulos de documentos describen el hecho económico; este archivo decide qué
// movimientos contables corresponden. La única diferencia con el original es que
// el plan de cuentas llega como parámetro (antes era un global).
// La equivalencia se verifica contra __fixtures__/asientos-oro.json, generado con
// el sistema actual: cualquier cambio de resultado hace fallar las pruebas.

import { dteC, dteV } from './dte';
import { PlanCuentas } from './plan-cuentas';
import { rutPartes } from './rut';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Extra = Record<string, any>;

export interface Movimiento extends Extra {
  cd: string;
  nm: string;
  debe: number;
  haber: number;
}

export interface Cuadratura {
  debe: number;
  haber: number;
  diferencia: number;
  ok: boolean;
}

export interface LineaDist {
  cuenta: string;
  monto: number;
  cc?: string;
  desc?: string;
  tratamientoTributario?: string;
  motivoTributario?: string;
}

export interface OtroImpuestoDetalle {
  tipo?: string;
  nombre?: string;
  monto: number;
  tasa?: number;
  tratamiento?: 'costo' | 'recuperable' | string;
  codigoF29?: string;
  cuenta?: string;
  cc?: string;
  desc?: string;
}

/** Documento de compra o venta tal como viene del registro o del RCV. */
export interface Documento extends Extra {
  id?: string;
  tipoDTE: number | string;
  numero?: string;
  fecha?: string;
  periodoContable?: string;
  fechaContabilizacion?: string;
  rutCodigo?: string;
  rutDV?: string;
  razonSocial?: string;
  glosa?: string;
  descripcion?: string;
  neto?: number;
  exento?: number;
  iva?: number;
  otrosImpuestos?: number;
  total?: number;
  dist?: LineaDist[];
  otrosImpuestosDetalle?: OtroImpuestoDetalle[];
}

const n = (v: unknown): number => Number(v) || 0;

function crearMov(plan: PlanCuentas) {
  return (cd: string, debe: number, haber: number, extra: Extra = {}): Movimiento => ({
    cd,
    nm: plan.nombre(cd),
    debe: n(debe),
    haber: n(haber),
    ...extra,
  });
}

// ── Fechas y período ──
// La fecha tributaria del documento y el período contable son conceptos distintos.
// Si la fecha documental es de un mes ANTERIOR al período, el asiento va el día 1
// del mes del libro; si es posterior (excepcional), el último día.
export function periodoContableCompra(d: Partial<Documento>): string {
  const pc = String(d?.periodoContable ?? '').trim();
  if (/^\d{4}-\d{2}$/.test(pc)) return pc;
  return String(d?.fecha ?? '').slice(0, 7);
}
export function ultimoDiaPeriodo(periodo: string): string {
  if (!/^\d{4}-\d{2}$/.test(String(periodo ?? ''))) return '';
  const [y, m] = periodo.split('-').map(Number);
  const dia = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}
export function primerDiaPeriodo(periodo: string): string {
  return /^\d{4}-\d{2}$/.test(String(periodo ?? '')) ? `${periodo}-01` : '';
}
export function fechaContabilizacionCompra(d: Partial<Documento>): string {
  const per = periodoContableCompra(d);
  const fc = String(d?.fechaContabilizacion ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(fc) && fc.slice(0, 7) === per) return fc;
  const fd = String(d?.fecha ?? '').trim();
  if (fd.slice(0, 7) === per) return fd;
  if (/^\d{4}-\d{2}$/.test(per) && fd && fd.slice(0, 7) < per) return primerDiaPeriodo(per);
  return ultimoDiaPeriodo(per) || fd;
}

export function cuadratura(movs: Movimiento[]): Cuadratura {
  const debe = movs.reduce((s, m) => s + n(m.debe), 0);
  const haber = movs.reduce((s, m) => s + n(m.haber), 0);
  return { debe, haber, diferencia: Math.round((debe - haber) * 100) / 100, ok: Math.abs(debe - haber) < 0.000001 };
}

// ── Ventas ──
export function asientoVenta(d: Documento, plan: PlanCuentas) {
  const mov = crearMov(plan);
  const dteInfo = dteV(d.tipoDTE);
  const signo = dteInfo?.signo || 1;
  const nombreDoc = dteInfo?.nm || 'DTE ' + d.tipoDTE;
  const descUser = (d.glosa || d.descripcion || '').trim();
  const glosa = descUser
    ? `${descUser} — ${nombreDoc} N°${d.numero}`
    : `${nombreDoc} N°${d.numero} — ${d.razonSocial || 'cliente'}`;
  const movs: Movimiento[] = [];
  const total = n(d.total) * signo;
  const neto = n(d.neto) * signo;
  const exento = n(d.exento) * signo;
  const otros = n(d.otrosImpuestos) * signo;
  const iva = n(d.iva) * signo;
  // El RCV es la fuente de verdad tributaria: si por redondeo Neto + IVA difiere
  // del Total, el asiento absorbe la diferencia en resultado.
  const ingresoInformado = neto + exento + otros;
  const ingreso = total ? total - iva : ingresoInformado;
  const cuentaDeb = d.formaPago === 'banco' ? '1101201' : d.formaPago === 'deudores' ? '1107003' : '1104001';
  const aux = {
    desc: `${d.razonSocial || ''} · ${nombreDoc} N°${d.numero}`.trim(),
    rutCodigo: d.rutCodigo,
    rutDV: d.rutDV,
    folio: d.numero,
    tipoDTE: d.tipoDTE,
    docId: d.id,
  };
  if (total) {
    if (total > 0) movs.push(mov(cuentaDeb, total, 0, cuentaDeb === '1104001' ? aux : { docId: d.id }));
    else movs.push(mov(cuentaDeb, 0, -total, cuentaDeb === '1104001' ? aux : { docId: d.id }));
  }
  const cuentaIng = d.cuentaIngreso || (dteInfo ? dteInfo.cuenta : '4101002');
  const descIng = descUser || undefined;
  // Distribución en varias líneas: lo que el Total agrega sobre la suma de líneas
  // (otros impuestos o redondeo) va a la primera.
  const distV = (d.dist || []).filter((l) => l && l.cuenta && n(l.monto));
  if (ingreso && distV.length) {
    const montos = distV.map((l) => n(l.monto) * signo);
    const resto = ingreso - montos.reduce((a, b) => a + b, 0);
    montos[0] += resto;
    distV.forEach((l, i) => {
      const m = montos[i];
      if (!m) return;
      const extra: Extra = { docId: d.id };
      const desc = String(l.desc || '').trim() || descUser;
      if (desc) extra.desc = desc;
      if (l.cc && plan.regla(l.cuenta)?.aceptaCentroCosto) {
        extra.cc = l.cc;
        extra.desc = [extra.desc, `CC: ${l.cc}`].filter(Boolean).join(' · ');
      }
      if (i === 0 && resto)
        extra.desc = [
          extra.desc,
          Math.abs(resto) <= 1 ? `Ajuste redondeo DTE ${resto > 0 ? '+' : ''}${resto}` : 'Incluye otros impuestos',
        ]
          .filter(Boolean)
          .join(' · ');
      if (m > 0) movs.push(mov(l.cuenta, 0, m, extra));
      else movs.push(mov(l.cuenta, -m, 0, extra));
    });
  } else if (ingreso) {
    if (ingreso > 0) movs.push(mov(cuentaIng as string, 0, ingreso, { docId: d.id, desc: descIng }));
    else movs.push(mov(cuentaIng as string, -ingreso, 0, { docId: d.id, desc: descIng }));
  }
  if (iva) {
    if (iva > 0) movs.push(mov('2103003', 0, iva, { docId: d.id }));
    else movs.push(mov('2103003', -iva, 0, { docId: d.id }));
  }
  return {
    fecha: d.fecha,
    glosa,
    movs,
    fuente: 'ventas',
    docId: d.id,
    tipoDTE: d.tipoDTE,
    folio: d.numero,
    rutCodigo: d.rutCodigo,
    cuadre: cuadratura(movs),
  };
}

// ── Compras: semántica tributaria ──
// Facturas de compra (45/46): totalDocumento = base + IVA; totalProveedor = totalDocumento − IVA retenido.
export function tributacionCompra(d: Documento) {
  const tipo = +d.tipoDTE;
  const notaFacturaCompra = (tipo === 61 || tipo === 56) && [45, 46].includes(+d.referencia?.tipoDTE);
  const facturaCompra =
    tipo === 45 || tipo === 46 || ((tipo === 61 || tipo === 56) && n(d.ivaRetenido) > 0) || notaFacturaCompra;
  const base = n(d.neto) + n(d.exento) + n(d.otrosImpuestos);
  const iva = n(d.iva);
  if (!facturaCompra) {
    return {
      facturaCompra: false,
      ivaRetenido: 0,
      base,
      totalDocumento: n(d.total),
      totalProveedor: n(d.total),
      totalInformado: n(d.total),
      diferenciaTotal: 0,
    } as Extra;
  }
  const ivaRetenido = Math.max(0, Math.min(Math.abs(iva), Math.abs(n(d.ivaRetenido != null ? d.ivaRetenido : iva))));
  const totalDocumento = base + iva;
  const totalProveedor = totalDocumento - ivaRetenido;
  const totalInformado = n(d.total);
  const coincideDocumento = Math.abs(totalInformado - totalDocumento) <= 1;
  const coincideProveedor = Math.abs(totalInformado - totalProveedor) <= 1;
  const totalIncluyeRetencion =
    d.totalIncluyeRetencion != null ? !!d.totalIncluyeRetencion : coincideDocumento && !coincideProveedor;
  return {
    facturaCompra: true,
    ivaRetenido,
    base,
    totalDocumento,
    totalProveedor,
    totalInformado,
    totalIncluyeRetencion,
    diferenciaTotal: Math.min(Math.abs(totalInformado - totalDocumento), Math.abs(totalInformado - totalProveedor)),
    totalInterpretado: coincideProveedor ? 'proveedor' : coincideDocumento ? 'documento' : 'no_coincide',
  } as Extra;
}

// Otros impuestos: costo (al gasto, o a su cuenta propia) o recuperable (1108006).
export interface OtroImpuestoClasificado {
  tipo: string;
  nombre: string;
  monto: number;
  tratamiento: 'costo' | 'recuperable';
  codigoF29: string;
  cuenta?: string;
  cc?: string;
  desc?: string;
}

export function clasificacionOtrosImpuestosCompra(d: Documento) {
  const total = Math.max(0, Math.abs(n(d.otrosImpuestos)));
  const entrada: OtroImpuestoDetalle[] = Array.isArray(d.otrosImpuestosDetalle) ? d.otrosImpuestosDetalle : [];
  let lista: OtroImpuestoClasificado[] = entrada
    .filter((x) => x && n(x.monto) > 0)
    .map((x) => ({
      tipo: String(x.tipo || 'otro'),
      nombre: String(x.nombre || 'Otro impuesto'),
      monto: Math.abs(n(x.monto)),
      tratamiento: x.tratamiento === 'recuperable' ? 'recuperable' : 'costo',
      codigoF29: String(x.codigoF29 || ''),
      // Cuenta propia (paso 2 del importador). Sin cuenta, el costo va a la primera línea.
      ...(x.cuenta && x.tratamiento !== 'recuperable'
        ? { cuenta: String(x.cuenta), cc: String(x.cc || ''), desc: String(x.desc || '') }
        : {}),
    }));
  if (!lista.length && total > 0)
    lista = [
      {
        tipo: 'otro',
        nombre: 'Otros impuestos',
        monto: total,
        tratamiento: d.tratamientoOtrosImpuestos === 'recuperable' ? 'recuperable' : 'costo',
        codigoF29: '',
      },
    ];
  const suma = lista.reduce((a, x) => a + x.monto, 0);
  if (total > 0 && suma > 0 && Math.abs(suma - total) > 1) {
    const factor = total / suma;
    let acum = 0;
    lista = lista.map((x, i) => {
      const monto = i === lista.length - 1 ? total - acum : Math.round(x.monto * factor);
      acum += monto;
      return { ...x, monto };
    });
  }
  const efectivo = total || lista.reduce((a, x) => a + x.monto, 0);
  const recuperable = lista.filter((x) => x.tratamiento === 'recuperable').reduce((a, x) => a + x.monto, 0);
  const costo = efectivo - recuperable;
  const costoCuenta = lista.filter((x) => x.tratamiento !== 'recuperable' && x.cuenta).reduce((a, x) => a + x.monto, 0);
  return { total: efectivo, recuperable, costo, costoCuenta, detalle: lista };
}

// IVA de compras: cuánto es crédito fiscal y cuánto va al costo.
export function clasificacionIVACompra(d: Documento) {
  const total = Math.abs(n(d.iva));
  if (!total) return { total: 0, recuperable: 0, noRecuperable: 0, activoFijo: 0, usoComun: 0, porcentajeRecuperable: 100 };
  const tieneExplicito = d.ivaRecuperable != null || d.ivaNoRecuperable != null;
  let recuperable = 0;
  let noRecuperable = 0;
  const usoComun = Math.max(0, Math.min(total, Math.abs(n(d.ivaUsoComun))));
  let porcentaje =
    d.porcentajeIvaRecuperable != null
      ? n(d.porcentajeIvaRecuperable)
      : d.factorProporcionalidad != null
        ? n(d.factorProporcionalidad)
        : 100;
  porcentaje = Math.max(0, Math.min(100, porcentaje));
  if (tieneExplicito) {
    const recExp = Math.max(0, Math.abs(n(d.ivaRecuperable)));
    const noExp = Math.max(0, Math.abs(n(d.ivaNoRecuperable)));
    if (d.ivaRecuperable != null && d.ivaNoRecuperable != null) {
      const suma = recExp + noExp;
      if (suma > 0) {
        recuperable = Math.round(total * (recExp / suma));
        noRecuperable = total - recuperable;
      } else noRecuperable = total;
    } else if (d.ivaRecuperable != null) {
      recuperable = Math.min(total, recExp);
      noRecuperable = total - recuperable;
    } else {
      noRecuperable = Math.min(total, noExp);
      recuperable = total - noRecuperable;
    }
  } else if (usoComun > 0) {
    const recUso = Math.round(usoComun * (porcentaje / 100));
    recuperable = total - usoComun + recUso;
    noRecuperable = total - recuperable;
  } else if (d.tratamientoIVA === 'no_recuperable') {
    recuperable = 0;
    noRecuperable = total;
    porcentaje = 0;
  } else if (d.tratamientoIVA === 'proporcional') {
    recuperable = Math.round(total * (porcentaje / 100));
    noRecuperable = total - recuperable;
  } else {
    recuperable = total;
    noRecuperable = 0;
    porcentaje = 100;
  }
  let activoFijo = Math.max(0, Math.min(recuperable, Math.abs(n(d.ivaActivoFijo))));
  if (d.tratamientoIVA === 'activo_fijo' && !activoFijo) activoFijo = recuperable;
  return { total, recuperable, noRecuperable, activoFijo, usoComun, porcentajeRecuperable: porcentaje };
}

// Reconciliación contra el Total del RCV (impuesto específico de combustibles, etc.).
export function residualTotalCompra(d: Documento): number {
  if (tributacionCompra(d).facturaCompra) return 0;
  const iva = Math.abs(n(d.iva));
  const otros = clasificacionOtrosImpuestosCompra(d).total;
  return Math.round(n(d.total) - (n(d.neto) + n(d.exento) + iva + otros));
}

export function asientoCompra(d: Documento, plan: PlanCuentas) {
  const mov = crearMov(plan);
  const dteInfo = dteC(d.tipoDTE);
  const signo = dteInfo?.signo || 1;
  const nombreDoc = dteInfo?.nm || 'DTE ' + d.tipoDTE;
  const descUser = (d.glosa || d.descripcion || '').trim();
  const glosa = descUser
    ? `${descUser} — ${nombreDoc} N°${d.numero}`
    : `${nombreDoc} N°${d.numero} — ${d.razonSocial || 'proveedor'}`;
  const movs: Movimiento[] = [];
  const dist = (d.dist || []).filter((l) => l && l.cuenta && n(l.monto));
  const sumDist = dist.reduce((s, l) => s + n(l.monto), 0);
  // Compatibilidad: documentos antiguos distribuían sólo el neto; el exento
  // faltante se lleva a la primera cuenta.
  const faltanteBase = Math.abs(sumDist - n(d.neto)) < 0.000001 ? n(d.exento) : 0;
  const otrosClas = clasificacionOtrosImpuestosCompra(d);
  const otros = otrosClas.costo - otrosClas.costoCuenta;
  const ivaClas = clasificacionIVACompra(d);
  // El IVA no recuperable va al costo, en proporción a la base de cada línea.
  const bases = dist.map((l, idx) => Math.max(0, n(l.monto) + (idx === 0 ? faltanteBase + otros : 0)));
  const totalBases = bases.reduce((a, b) => a + b, 0);
  let noRecAsignado = 0;
  dist.forEach((l, idx) => {
    let monto = bases[idx];
    if (ivaClas.noRecuperable) {
      const extraNoRec =
        idx === dist.length - 1
          ? ivaClas.noRecuperable - noRecAsignado
          : Math.round(ivaClas.noRecuperable * (totalBases ? monto / totalBases : idx === 0 ? 1 : 0));
      monto += extraNoRec;
      noRecAsignado += extraNoRec;
    }
    monto *= signo;
    if (!monto) return;
    const extra: Extra = { docId: d.id };
    const partesDesc: string[] = [];
    const descLinea = String(l.desc || '').trim();
    if (descLinea) partesDesc.push(descLinea);
    else if (descUser) partesDesc.push(descUser);
    if (l.cc && plan.regla(l.cuenta)?.aceptaCentroCosto) {
      partesDesc.push(`CC: ${l.cc}`);
      extra.cc = l.cc;
    }
    if (partesDesc.length) extra.desc = partesDesc.join(' · ');
    if (l.tratamientoTributario === 'rechazado') {
      extra.tributario = 'gasto_rechazado';
      extra.motivoTributario = l.motivoTributario || 'Marcado como gasto rechazado en documento de compra';
    }
    if (monto > 0) movs.push(mov(l.cuenta, monto, 0, extra));
    else movs.push(mov(l.cuenta, 0, -monto, extra));
  });
  const movAjusteBase = movs.length ? movs[movs.length - 1] : null;
  // Otros impuestos de costo con cuenta propia
  otrosClas.detalle
    .filter((x) => x.tratamiento !== 'recuperable' && x.cuenta)
    .forEach((x) => {
      const m = x.monto * signo;
      if (!m) return;
      const extra: Extra = { docId: d.id, tributo: 'otro_impuesto_costo' };
      const partes = [x.desc || x.nombre].filter(Boolean) as string[];
      if (x.cc && plan.regla(x.cuenta)?.aceptaCentroCosto) {
        partes.push(`CC: ${x.cc}`);
        extra.cc = x.cc;
      }
      if (partes.length) extra.desc = partes.join(' · ');
      if (m > 0) movs.push(mov(x.cuenta as string, m, 0, extra));
      else movs.push(mov(x.cuenta as string, 0, -m, extra));
    });
  const ivaAF = ivaClas.activoFijo * signo;
  const ivaGeneral = (ivaClas.recuperable - ivaClas.activoFijo) * signo;
  if (ivaGeneral) {
    if (ivaGeneral > 0) movs.push(mov('1108002', ivaGeneral, 0, { docId: d.id, tributo: 'iva_credito' }));
    else movs.push(mov('1108002', 0, -ivaGeneral, { docId: d.id, tributo: 'iva_credito' }));
  }
  if (ivaAF) {
    if (ivaAF > 0) movs.push(mov('1108008', ivaAF, 0, { docId: d.id, tributo: 'iva_credito_activo_fijo' }));
    else movs.push(mov('1108008', 0, -ivaAF, { docId: d.id, tributo: 'iva_credito_activo_fijo' }));
  }
  const otrosRec = otrosClas.recuperable * signo;
  if (otrosRec) {
    if (otrosRec > 0) movs.push(mov('1108006', otrosRec, 0, { docId: d.id, tributo: 'impuesto_adicional_recuperable' }));
    else movs.push(mov('1108006', 0, -otrosRec, { docId: d.id, tributo: 'impuesto_adicional_recuperable' }));
  }
  const trib = tributacionCompra(d);
  // La obligación se construye desde el Total exacto del RCV.
  const totalInfo = Math.abs(trib.totalInformado);
  const retInfo = trib.facturaCompra ? Math.abs(trib.ivaRetenido) : 0;
  const provBase = trib.facturaCompra
    ? trib.totalIncluyeRetencion
      ? Math.max(0, totalInfo - retInfo)
      : totalInfo
    : totalInfo;
  const obligacion = provBase + retInfo;
  const netoMovs = movs.reduce((s, m) => s + n(m.debe) - n(m.haber), 0);
  const ajuste = obligacion * signo - netoMovs;
  // En compras corrientes el residual se lleva al costo (mientras no deje la línea
  // negativa); en facturas de compra sólo se admite el redondeo de $1.
  if (Math.abs(ajuste) > 0.000001 && dist.length && movAjusteBase) {
    const netoLinea = n(movAjusteBase.debe) - n(movAjusteBase.haber) + ajuste;
    const dentroDeRedondeo = Math.abs(ajuste) <= 1;
    const reconciliaContraTotal = !trib.facturaCompra && netoLinea * signo >= 0;
    if (dentroDeRedondeo || reconciliaContraTotal) {
      movAjusteBase.debe = netoLinea > 0 ? netoLinea : 0;
      movAjusteBase.haber = netoLinea < 0 ? -netoLinea : 0;
      movAjusteBase.ajusteRedondeoDte = ajuste;
      const etiqueta = dentroDeRedondeo
        ? `Ajuste redondeo DTE ${ajuste > 0 ? '+' : ''}${ajuste}`
        : `Ajuste a Total RCV ${ajuste > 0 ? '+' : ''}${ajuste}`;
      movAjusteBase.desc = [movAjusteBase.desc, etiqueta].filter(Boolean).join(' · ');
    }
  }
  const prov = provBase * signo;
  const aux = {
    desc: `${d.razonSocial || ''} · ${nombreDoc} N°${d.numero}`.trim(),
    rutCodigo: d.rutCodigo,
    rutDV: d.rutDV,
    folio: d.numero,
    tipoDTE: d.tipoDTE,
    docId: d.id,
  };
  if (prov) {
    if (prov > 0) movs.push(mov('2102001', 0, prov, aux));
    else movs.push(mov('2102001', -prov, 0, aux));
  }
  if (trib.facturaCompra && trib.ivaRetenido) {
    const ret = trib.ivaRetenido * signo;
    const extra = { desc: 'IVA retenido factura de compra', docId: d.id, tributo: 'iva_retenido' };
    if (ret > 0) movs.push(mov('2103005', 0, ret, extra));
    else movs.push(mov('2103005', -ret, 0, extra));
  }
  return {
    fecha: fechaContabilizacionCompra(d),
    glosa,
    movs,
    fuente: 'compras',
    docId: d.id,
    tipoDTE: d.tipoDTE,
    folio: d.numero,
    rutCodigo: d.rutCodigo,
    tributacion: trib,
    ivaClasificacion: ivaClas,
    otrosImpuestosClasificacion: otrosClas,
    cuadre: cuadratura(movs),
  };
}

// ── Honorarios ──
// Boleta como documento de proveedor (DTE 70 con retención / 71 sin retención).
export function asientoHonorarioDoc(d: Documento, plan: PlanCuentas) {
  const mov = crearMov(plan);
  const bruto = n(d.bruto != null ? d.bruto : d.total);
  const sinRet = +d.tipoDTE === 71 || d.tipoRetencion === 'sin_retencion' || d.retencion === 0;
  const ret = sinRet ? 0 : n(d.retencion != null ? d.retencion : Math.round(bruto * n(d.tasaRetencion)));
  const liquido = bruto - ret;
  const fecha = fechaContabilizacionCompra(d);
  const nombreDoc = dteC(d.tipoDTE)?.nm || 'Boleta de honorarios';
  const desc = `${d.razonSocial || ''} · ${nombreDoc} N°${d.numero || ''}`.trim();
  const auxProv = { rutCodigo: d.rutCodigo, rutDV: d.rutDV, folio: d.numero, tipoDTE: d.tipoDTE, docId: d.id, desc };
  const movs: Movimiento[] = [];
  const lineaGasto = (cuenta: string, monto: number, cc?: string) => {
    if (!cuenta || !monto) return;
    const r = plan.regla(cuenta);
    const extra: Extra = { docId: d.id };
    if (!r || r.requiereAuxiliar) {
      extra.rutCodigo = d.rutCodigo;
      extra.rutDV = d.rutDV;
      extra.folio = d.numero;
      extra.tipoDTE = d.tipoDTE;
      extra.desc = desc;
    }
    if (cc && (!r || r.aceptaCentroCosto)) extra.cc = cc;
    movs.push(mov(cuenta, monto, 0, extra));
  };
  const dist = (d.dist || []).filter((l) => l && l.cuenta && n(l.monto));
  if (dist.length) dist.forEach((l) => lineaGasto(l.cuenta, n(l.monto), l.cc));
  else lineaGasto(d.cuentaGasto || '3202019', bruto, d.cc);
  if (ret) movs.push(mov('2103002', 0, ret, { docId: d.id, desc: 'Retención honorarios', tributo: 'retencion_honorarios' }));
  if (liquido) movs.push(mov('2102006', 0, liquido, auxProv));
  return {
    fecha,
    glosa: `${nombreDoc}${d.numero ? ' N°' + d.numero : ''} — ${d.razonSocial || 'prestador'}`,
    movs,
    fuente: 'compras',
    docId: d.id,
    tipoDTE: d.tipoDTE,
    folio: d.numero,
    rutCodigo: d.rutCodigo,
    tributacion: { honorario: true, bruto, retencion: ret, liquido },
    cuadre: cuadratura(movs),
  };
}

export interface Honorario extends Extra {
  id?: string;
  rut?: string;
  nombre?: string;
  bruto: number;
  numero?: string;
  fecha?: string;
  mes?: number;
}

// Reconocimiento y pago son hechos económicos distintos.
export function asientoHonorario(h: Honorario, anio: number, plan: PlanCuentas) {
  const mov = crearMov(plan);
  const bruto = n(h.bruto);
  const sinRet = h.tipoRetencion === 'sin_retencion';
  const tasa = sinRet ? 0 : n(h.tasaRetencion != null ? h.tasaRetencion : h.retencionTasa);
  const ret = sinRet ? 0 : n(h.retencion != null ? h.retencion : Math.round(bruto * tasa));
  const liquido = bruto - ret;
  const rp = rutPartes(h.rut);
  const fecha = h.fecha || `${anio}-${String(h.mes || 1).padStart(2, '0')}-28`;
  const aux = {
    rutCodigo: rp.rutCodigo,
    rutDV: rp.rutDV,
    docId: h.id,
    folio: h.numero || h.folio || '',
    tipoAux: 'honorario',
    desc: h.nombre || 'Honorario',
  };
  const movs: Movimiento[] = [];
  if (bruto) movs.push(mov(h.cuentaGasto || '3202019', bruto, 0, { ...aux, cc: h.cc || undefined }));
  if (ret) movs.push(mov('2103002', 0, ret, { docId: h.id, tributo: 'retencion_honorarios' }));
  if (liquido) movs.push(mov('2102006', 0, liquido, aux));
  return {
    fecha,
    glosa: `Boleta de honorarios${h.numero ? ' N°' + h.numero : ''} — ${h.nombre || 'prestador'}`,
    movs,
    fuente: 'honorarios',
    docId: h.id,
    rutCodigo: rp.rutCodigo,
    retencion: ret,
    liquido,
    cuadre: cuadratura(movs),
  };
}

export function asientoPagoHonorario(h: Honorario, anio: number, plan: PlanCuentas) {
  const mov = crearMov(plan);
  const rec = asientoHonorario(h, anio, plan);
  const cuenta = h.cuentaPago || '1101201';
  const liquido = rec.liquido;
  const rp = rutPartes(h.rut);
  const aux = {
    rutCodigo: rp.rutCodigo,
    rutDV: rp.rutDV,
    docId: h.id,
    folio: h.numero || h.folio || '',
    tipoAux: 'honorario',
    desc: h.nombre || 'Honorario',
  };
  const movs: Movimiento[] = [];
  if (liquido) {
    movs.push(mov('2102006', liquido, 0, aux));
    movs.push(mov(cuenta, 0, liquido, { docId: h.id, desc: `Pago honorario ${h.nombre || ''}`.trim() }));
  }
  return {
    fecha: h.fechaPago || rec.fecha,
    glosa: `Pago boleta de honorarios${h.numero ? ' N°' + h.numero : ''} — ${h.nombre || 'prestador'}`,
    movs,
    fuente: 'honorarios',
    docId: h.id,
    cuentaPago: cuenta,
    cuadre: cuadratura(movs),
  };
}
