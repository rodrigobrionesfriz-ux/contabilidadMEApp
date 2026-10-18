// Traspaso del respaldo Excel del sistema actual (botón "Exportar" / BD Excel) a la base nueva.
// Reproduce genDiario() del sistema actual: los asientos persistidos son el maestro y los
// documentos antiguos sin asiento propio se contabilizan con el mismo motor.
// Función pura: no toca la base; devuelve el plan de carga y los problemas encontrados.

import { PlanCuentas, type CuentaBase } from '@/motor/plan-cuentas';
import { asientoCompra, asientoVenta, type Documento } from '@/motor/contable';
import { rutDV } from '@/motor/rut';

export type Fila = Record<string, unknown>;

/** Hojas del respaldo como filas con encabezado (salida de XLSX.utils.sheet_to_json). */
export interface HojasRespaldo {
  Empresa?: unknown[][];
  Ventas?: Fila[];
  Compras?: Fila[];
  Honorarios?: Fila[];
  Asientos?: Fila[];
  Apertura?: Fila[];
  CierresContables?: Fila[];
  CentrosCosto?: Fila[];
  PlanDeCuentas?: Fila[];
}

export interface LineaImport {
  cuenta: string;
  debe: number;
  haber: number;
  glosa?: string;
  cc?: string;
  rut?: string;
  tipo_dte?: number;
  folio?: string;
}

export interface AsientoImport {
  numero: number;
  fecha: string;
  glosa: string;
  tipo: string;
  ref: string;
  origen_id?: string;
  anulado: boolean;
  motivo?: string;
  lineas: LineaImport[];
}

export interface DocumentoImport {
  tipo: 'compra' | 'venta' | 'honorario';
  ref: string;
  asiento_ref?: string;
  tipo_dte?: number;
  folio?: string;
  fecha?: string;
  rut?: string;
  razon_social?: string;
  neto: number;
  exento: number;
  iva: number;
  total: number;
  estado?: string;
  datos: unknown;
}

export interface CentroImport {
  ref: string;
  nivel: number;
  nombre: string;
  codigo?: string;
  padre_ref?: string;
  estado?: string;
  fecha_inicio?: string;
  curva?: string;
  pcts?: unknown;
  cuenta_costo?: string;
}

export interface Problema {
  nivel: 'error' | 'aviso';
  mensaje: string;
}

export interface PlanCarga {
  anio: number;
  empresa: { nombre: string; rut: string };
  cuentas: { codigo: string; nombre: string; tipo: string; naturaleza: string }[];
  centros: CentroImport[];
  asientos: AsientoImport[];
  documentos: DocumentoImport[];
  cierres: string[];
  /** Sumas por cuenta de los asientos vigentes, para cuadrar contra la base tras importar */
  totales: Record<string, { debe: number; haber: number }>;
  resumen: {
    asientos: number;
    anulados: number;
    generados: number;
    renumerados: number;
    documentos: number;
    debe: number;
  };
  problemas: Problema[];
}

const RETENCION_POR_ANIO: Record<number, number> = {
  2020: 10.75, 2021: 11.5, 2022: 12.25, 2023: 13.0, 2024: 13.75, 2025: 14.5, 2026: 15.25, 2027: 16.0, 2028: 17.0,
};
export function retencionHonorarios(anio: number): number {
  if (RETENCION_POR_ANIO[anio] != null) return RETENCION_POR_ANIO[anio] / 100;
  const anios = Object.keys(RETENCION_POR_ANIO).map(Number);
  return RETENCION_POR_ANIO[anio > Math.max(...anios) ? Math.max(...anios) : Math.min(...anios)] / 100;
}

const txt = (v: unknown) => (v == null ? '' : String(v)).trim();
const num = (v: unknown) => {
  const x = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(x) ? x : 0;
};
const json = <T>(v: unknown, def: T): T => {
  if (v == null || v === '') return def;
  if (typeof v !== 'string') return v as T;
  try {
    return JSON.parse(v) as T;
  } catch {
    return def;
  }
};
const fechaISO = (v: unknown): string => {
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    // Fecha serial de Excel
    return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  }
  const s = txt(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
};
const rutDe = (codigo: unknown, dv?: unknown): string | undefined => {
  const c = txt(codigo).replace(/[^0-9]/g, '');
  if (!c) return undefined;
  const d = txt(dv).toUpperCase() || rutDV(c);
  return `${c}-${d}`;
};
const rutTexto = (rut: unknown): string | undefined => {
  const l = txt(rut).replace(/[^0-9kK]/g, '').toUpperCase();
  return l.length > 1 ? `${l.slice(0, -1)}-${l.slice(-1)}` : undefined;
};

/** Documento completo: preferimos la columna documentoJSON (objeto original íntegro). */
function documentoDe(f: Fila): Documento {
  const completo = json<Documento | null>(f.documentoJSON, null);
  if (completo && typeof completo === 'object') return completo;
  const d: Documento = { ...(f as Documento) };
  d.dist = json(f.distJSON, []);
  d.referencia = json(f.referenciaJSON, null);
  d.otrosImpuestosDetalle = json(f.otrosImpuestosDetalleJSON, []);
  return d;
}

export interface MovLegado {
  cd?: unknown;
  debe?: unknown;
  haber?: unknown;
  desc?: unknown;
  cc?: unknown;
  rutCodigo?: unknown;
  rutDV?: unknown;
  tipoDTE?: unknown;
  folio?: unknown;
  dte?: { tipo?: unknown; tipoDTE?: unknown; folio?: unknown; numero?: unknown } | null;
}

/** Normaliza montos a pesos enteros no negativos (un negativo al debe pasa al haber). */
export function lineasDe(movs: MovLegado[]): LineaImport[] {
  const out: LineaImport[] = [];
  for (const m of movs || []) {
    const cuenta = txt(m.cd).replace(/[^0-9]/g, '');
    let d = num(m.debe);
    let h = num(m.haber);
    if (d < 0) { h += -d; d = 0; }
    if (h < 0) { d += -h; h = 0; }
    const base: Omit<LineaImport, 'debe' | 'haber'> = { cuenta };
    const glosa = txt(m.desc);
    if (glosa) base.glosa = glosa.slice(0, 500);
    if (txt(m.cc)) base.cc = txt(m.cc);
    const rut = rutDe(m.rutCodigo, m.rutDV);
    if (rut) base.rut = rut;
    const dte = num(m.tipoDTE ?? m.dte?.tipoDTE ?? m.dte?.tipo);
    if (dte) base.tipo_dte = dte;
    const folio = txt(m.folio ?? m.dte?.folio ?? m.dte?.numero);
    if (folio) base.folio = folio;
    if (d > 0 && h > 0) {
      out.push({ ...base, debe: d, haber: 0 }, { ...base, debe: 0, haber: h });
    } else if (d > 0 || h > 0) {
      out.push({ ...base, debe: d, haber: h });
    }
  }
  return out;
}

/** Redondea a pesos. Si el redondeo deja hasta $2 de diferencia, la absorbe la línea mayor. */
export function redondear(lineas: LineaImport[]): { lineas: LineaImport[]; ajuste: number; descuadre: number } {
  const r = lineas.map((l) => ({ ...l, debe: Math.round(l.debe), haber: Math.round(l.haber) }))
    .filter((l) => l.debe > 0 || l.haber > 0);
  const exacto = lineas.reduce((s, l) => s + l.debe - l.haber, 0);
  let dif = r.reduce((s, l) => s + l.debe - l.haber, 0);
  let ajuste = 0;
  if (dif !== 0 && Math.abs(dif) <= 2 && Math.abs(exacto) < 0.5) {
    const lado = dif > 0 ? 'debe' : 'haber';
    const mayor = r.filter((l) => l[lado] > 0).sort((a, b) => b[lado] - a[lado])[0];
    if (mayor) { mayor[lado] -= Math.abs(dif); ajuste = dif; dif = 0; }
  }
  return { lineas: r, ajuste, descuadre: dif };
}

interface AsientoLegado {
  id?: unknown;
  n?: unknown;
  numeroContable?: unknown;
  folioComp?: unknown;
  fecha?: unknown;
  glosa?: unknown;
  tipo?: unknown;
  subtipo?: unknown;
  fuente?: unknown;
  docId?: unknown;
  referenciaDoc?: { fuente?: unknown; docId?: unknown } | null;
  anulado?: unknown;
  motivoAnulacion?: unknown;
  anuladoMotivo?: unknown;
  movs?: MovLegado[];
}

interface Candidato {
  numeroOriginal: number;
  orden: number;
  fecha: string;
  glosa: string;
  tipo: string;
  ref: string;
  origen_id?: string;
  anulado: boolean;
  motivo?: string;
  movs: MovLegado[];
}

export function construirPlanCarga(h: HojasRespaldo, pdcBase: CuentaBase[]): PlanCarga {
  const problemas: Problema[] = [];
  const err = (mensaje: string) => problemas.push({ nivel: 'error', mensaje });
  const aviso = (mensaje: string) => problemas.push({ nivel: 'aviso', mensaje });

  // ── Empresa y año ──
  const meta = new Map((h.Empresa ?? []).filter((r) => Array.isArray(r) && r.length >= 2).map((r) => [txt(r[0]), r[1]]));
  const empresa = { nombre: txt(meta.get('Empresa')), rut: txt(meta.get('RUT')) };
  let anio = num(meta.get('Año'));
  if (!anio) {
    const f = [...(h.Asientos ?? []), ...(h.Compras ?? []), ...(h.Ventas ?? [])].map((x) => fechaISO(x.fecha)).find(Boolean);
    anio = f ? +f.slice(0, 4) : 0;
  }
  if (!anio) err('No se pudo determinar el año del respaldo (hoja "Empresa", fila "Año").');

  // ── Plan de cuentas: el del respaldo (incluye cuentas propias) sobre la base ──
  const porCodigo = new Map<string, CuentaBase>(pdcBase.map((c) => [c.cd, c]));
  const cuentasNuevas: PlanCarga['cuentas'] = [];
  for (const f of h.PlanDeCuentas ?? []) {
    const cd = txt(f['Código']).replace(/[^0-9]/g, '');
    if (!cd) continue;
    const c: CuentaBase = { cd, nm: txt(f['Nombre']) || cd, tp: txt(f['Tipo']).toUpperCase(), nat: txt(f['Naturaleza']).toUpperCase() };
    if (!porCodigo.has(cd)) {
      if (!['T', 'S', 'A', 'P', 'C', 'I'].includes(c.tp ?? '')) {
        aviso(`Cuenta ${cd} "${c.nm}" sin tipo válido (${c.tp || 'vacío'}); se tratará como gasto (C).`);
        c.tp = 'C';
      }
      cuentasNuevas.push({ codigo: cd, nombre: c.nm, tipo: c.tp!, naturaleza: ['D', 'C'].includes(c.nat ?? '') ? c.nat! : '' });
    }
    porCodigo.set(cd, { ...porCodigo.get(cd), ...c });
  }
  const plan = new PlanCuentas([...porCodigo.values()]);

  // ── Centros de costo ──
  const centros: CentroImport[] = (h.CentrosCosto ?? []).filter((f) => txt(f.id)).map((f) => ({
    ref: txt(f.id),
    nivel: num(f.nivel) === 2 ? 2 : 1,
    nombre: txt(f.nombre) || txt(f.id),
    codigo: txt(f.codigo) || undefined,
    padre_ref: txt(f.padre) || undefined,
    estado: txt(f.estado) || undefined,
    fecha_inicio: fechaISO(f.fechaInicio) || undefined,
    curva: txt(f.curva) || undefined,
    pcts: json(f.pctsCapitalizacionJSON, null),
    cuenta_costo: txt(f.cuentaCosto) || undefined,
  }));
  // Centros sin código en el sistema actual: código legible (principal "CC1", subcentro "<principal>-1")
  const codigos = new Set(centros.map((c) => c.codigo).filter(Boolean));
  const libre = (base: string) => {
    let i = 1;
    while (codigos.has(`${base}${i}`)) i++;
    codigos.add(`${base}${i}`);
    return `${base}${i}`;
  };
  for (const c of centros.filter((x) => x.nivel === 1 && !x.codigo)) c.codigo = libre('CC');
  for (const c of centros.filter((x) => x.nivel === 2 && !x.codigo)) {
    const padre = centros.find((p) => p.ref === c.padre_ref);
    c.codigo = libre(padre?.codigo ? `${padre.codigo}-` : 'CC');
  }

  // ── Documentos ──
  const ventas = (h.Ventas ?? []).map(documentoDe);
  const compras = (h.Compras ?? []).map(documentoDe);
  const honorarios = (h.Honorarios ?? []).map((f) => ({ ...f }) as Record<string, unknown>);

  // ── Asientos persistidos (maestro) ──
  const persistidos: AsientoLegado[] = (h.Asientos ?? []).map((f) => {
    const a = json<AsientoLegado | null>(f.asientoJSON, null) ?? { ...(f as AsientoLegado) };
    if (!a.movs) a.movs = json(f.movsJSON, []);
    return a;
  });
  const vigente = (a: AsientoLegado) => !a.anulado;
  const fuenteDe = (a: AsientoLegado) => txt(a.fuente) || txt(a.referenciaDoc?.fuente);
  const docDe = (a: AsientoLegado) => txt(a.docId) || txt(a.referenciaDoc?.docId);
  // Igual que genDiario: un documento se considera contabilizado si hay un asiento vigente tipo documento
  const asientoDeDoc = new Map<string, string>();
  for (const a of persistidos) {
    if (!vigente(a) || !docDe(a)) continue;
    const f = fuenteDe(a);
    if (a.tipo === 'documento' && (f === 'ventas' || f === 'compras')) asientoDeDoc.set(`${f}:${docDe(a)}`, txt(a.id));
    if (f === 'honorarios' && a.subtipo === 'honorario') asientoDeDoc.set(`honorarios:${docDe(a)}`, txt(a.id));
  }

  const candidatos: Candidato[] = [];
  let orden = 0;

  // Apertura (asiento N°0)
  const ap = (h.Apertura ?? [])[0];
  if (ap) {
    const movs = json<MovLegado[]>(ap.movsJSON, []);
    if (movs.length) {
      candidatos.push({ numeroOriginal: 0, orden: orden++, fecha: fechaISO(ap.fecha) || `${anio}-01-01`,
        glosa: txt(ap.glosa) || 'Balance de Apertura', tipo: 'apertura', ref: `apertura:${anio}`, anulado: false, movs });
    }
  }

  // Documentos antiguos sin asiento propio (en el orden de genDiario)
  const automaticos: { e: ReturnType<typeof asientoVenta> | ReturnType<typeof asientoCompra>; fuente: string }[] = [];
  for (const d of ventas) {
    if (d.excluidoAuto || d.estado === 'anulado' || asientoDeDoc.has(`ventas:${d.id}`)) continue;
    automaticos.push({ e: asientoVenta(d, plan), fuente: 'ventas' });
  }
  for (const d of compras) {
    if (d.excluidoAuto || d.estado === 'anulado' || asientoDeDoc.has(`compras:${d.id}`)) continue;
    automaticos.push({ e: asientoCompra(d, plan), fuente: 'compras' });
  }
  automaticos.sort((a, b) => txt(a.e.fecha).localeCompare(txt(b.e.fecha)));
  for (const { e, fuente } of automaticos) {
    candidatos.push({ numeroOriginal: 0, orden: orden++, fecha: fechaISO(e.fecha), glosa: txt(e.glosa),
      tipo: fuente === 'ventas' ? 'venta' : 'compra', ref: `auto:${fuente}:${e.docId}`, origen_id: txt(e.docId),
      anulado: false, movs: e.movs as MovLegado[] });
  }
  for (const ho of honorarios) {
    const id = txt(ho.id);
    if (ho.estado === 'anulado' || asientoDeDoc.has(`honorarios:${id}`)) continue;
    const bruto = num(ho.bruto);
    if (!bruto) continue;
    const sinRet = ho.tipoRetencion === 'sin_retencion';
    const tasa = sinRet ? 0 : txt(ho.tasaRetencion) !== '' ? num(ho.tasaRetencion) : retencionHonorarios(anio);
    const ret = sinRet ? 0 : txt(ho.retencion) !== '' ? num(ho.retencion) : Math.round(bruto * tasa);
    const liq = bruto - ret;
    const rut = rutTexto(ho.rut);
    const [rc, dv] = rut ? rut.split('-') : ['', ''];
    const aux = { rutCodigo: rc, rutDV: dv, desc: txt(ho.nombre) || 'Honorario' };
    const movs: MovLegado[] = [
      { cd: '3202019', debe: bruto, haber: 0, ...aux, cc: txt(ho.cc) || undefined },
      ...(ret ? [{ cd: '2103002', debe: 0, haber: ret }] : []),
      { cd: '2102006', debe: 0, haber: liq, ...aux },
    ];
    const fecha = fechaISO(ho.fecha) || `${anio}-${String(num(ho.mes) || 1).padStart(2, '0')}-28`;
    candidatos.push({ numeroOriginal: 0, orden: orden++, fecha, glosa: `Honorario — ${txt(ho.nombre) || 'prestador'}`,
      tipo: 'honorario', ref: `auto:honorarios:${id}`, origen_id: id, anulado: false, movs });
  }

  // Persistidos: conservan su número contable original
  for (const a of persistidos) {
    candidatos.push({
      numeroOriginal: Math.trunc(num(a.numeroContable) || num(a.folioComp) || num(a.n)),
      orden: orden++,
      fecha: fechaISO(a.fecha),
      glosa: txt(a.glosa),
      tipo: txt(a.tipo) || 'manual',
      ref: txt(a.id) || `asiento:${orden}`,
      origen_id: docDe(a) || undefined,
      anulado: !!a.anulado,
      motivo: txt(a.motivoAnulacion ?? a.anuladoMotivo) || (a.anulado ? 'Anulado en el sistema anterior' : undefined),
      movs: a.movs ?? [],
    });
  }

  // ── Numeración: originales únicos se respetan; el resto sigue desde el máximo ──
  const usados = new Set<number>();
  const conNumero = new Map<Candidato, number>();
  for (const c of candidatos) {
    if (c.tipo === 'apertura') { conNumero.set(c, 0); continue; }
    if (c.numeroOriginal > 0 && !usados.has(c.numeroOriginal)) { usados.add(c.numeroOriginal); conNumero.set(c, c.numeroOriginal); }
  }
  let siguiente = Math.max(0, ...usados) + 1;
  let renumerados = 0;
  const pendientes = candidatos.filter((c) => !conNumero.has(c))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.orden - b.orden);
  for (const c of pendientes) {
    if (c.numeroOriginal > 0) {
      renumerados++;
      aviso(`El N° ${c.numeroOriginal} está repetido ("${c.glosa}"); se importa como N° ${siguiente}.`);
    }
    conNumero.set(c, siguiente++);
  }

  // ── Construcción final y validación ──
  const asientos: AsientoImport[] = [];
  const totales: PlanCarga['totales'] = {};
  let generados = 0;
  for (const c of [...candidatos].sort((a, b) => conNumero.get(a)! - conNumero.get(b)!)) {
    const numero = conNumero.get(c)!;
    const etiqueta = `N° ${numero} del ${c.fecha || '(sin fecha)'} "${c.glosa}"`;
    if (!c.fecha) { err(`Asiento ${etiqueta}: sin fecha.`); continue; }
    if (anio && +c.fecha.slice(0, 4) !== anio) {
      err(`Asiento ${etiqueta}: la fecha no es del año ${anio}.`);
      continue;
    }
    const { lineas, ajuste, descuadre } = redondear(lineasDe(c.movs));
    if (ajuste) aviso(`Asiento ${etiqueta}: ajuste de redondeo de $${Math.abs(ajuste)}.`);
    const faltan = [...new Set(lineas.map((l) => l.cuenta).filter((cd) => !porCodigo.has(cd)))];
    let lineasOk = lineas;
    if (descuadre || faltan.length) {
      const motivo = descuadre ? `no cuadra (diferencia $${descuadre})` : `usa cuentas inexistentes: ${faltan.join(', ')}`;
      if (c.anulado) {
        aviso(`Asiento anulado ${etiqueta} ${motivo}; se importa sin líneas.`);
        lineasOk = [];
      } else {
        err(`Asiento ${etiqueta} ${motivo}.`);
        continue;
      }
    }
    if (!lineasOk.length && !c.anulado) { aviso(`Asiento ${etiqueta}: sin movimientos, se omite.`); continue; }
    if (c.ref.startsWith('auto:')) generados++;
    asientos.push({ numero, fecha: c.fecha, glosa: c.glosa || 'Sin glosa', tipo: c.tipo, ref: c.ref,
      origen_id: c.origen_id, anulado: c.anulado, motivo: c.motivo, lineas: lineasOk });
    if (!c.anulado) {
      for (const l of lineasOk) {
        const t = (totales[l.cuenta] ??= { debe: 0, haber: 0 });
        t.debe += l.debe;
        t.haber += l.haber;
      }
    }
  }

  // ── Documentos con su asiento ──
  const refAsiento = new Set(asientos.map((a) => a.ref));
  const enlace = (clave: string, auto: string) => {
    const r = asientoDeDoc.get(clave) ?? auto;
    return refAsiento.has(r) ? r : undefined;
  };
  const documentos: DocumentoImport[] = [
    ...ventas.map((d) => docImport('venta', d, enlace(`ventas:${d.id}`, `auto:ventas:${d.id}`))),
    ...compras.map((d) => docImport('compra', d, enlace(`compras:${d.id}`, `auto:compras:${d.id}`))),
    ...honorarios.map((ho): DocumentoImport => ({
      tipo: 'honorario', ref: txt(ho.id), asiento_ref: enlace(`honorarios:${txt(ho.id)}`, `auto:honorarios:${txt(ho.id)}`),
      fecha: fechaISO(ho.fecha) || undefined, rut: rutTexto(ho.rut), razon_social: txt(ho.nombre) || undefined,
      neto: 0, exento: 0, iva: 0, total: Math.round(num(ho.bruto)), estado: txt(ho.estado) || undefined, datos: ho,
    })),
  ].filter((d) => d.ref);

  const cierres = (h.CierresContables ?? [])
    .filter((f) => txt(f.estado) === 'cerrado' && /^\d{4}-\d{2}$/.test(txt(f.periodo)))
    .map((f) => txt(f.periodo));

  return {
    anio,
    empresa,
    cuentas: cuentasNuevas,
    centros,
    asientos,
    documentos,
    cierres,
    totales,
    resumen: {
      asientos: asientos.length,
      anulados: asientos.filter((a) => a.anulado).length,
      generados,
      renumerados,
      documentos: documentos.length,
      debe: Object.values(totales).reduce((s, t) => s + t.debe, 0),
    },
    problemas,
  };
}

function docImport(tipo: 'compra' | 'venta', d: Documento, asiento_ref?: string): DocumentoImport {
  return {
    tipo,
    ref: txt(d.id),
    asiento_ref,
    tipo_dte: num(d.tipoDTE) || undefined,
    folio: txt(d.numero) || undefined,
    fecha: fechaISO(d.fecha) || undefined,
    rut: rutDe(d.rutCodigo, d.rutDV),
    razon_social: txt(d.razonSocial) || undefined,
    neto: Math.round(num(d.neto)),
    exento: Math.round(num(d.exento)),
    iva: Math.round(num(d.iva)),
    total: Math.round(num(d.total)),
    estado: txt(d.estado) || undefined,
    datos: d,
  };
}

/** Divide en lotes para no exceder el tamaño de una llamada. */
export function enLotes<T>(arr: T[], tam: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += tam) out.push(arr.slice(i, i + tam));
  return out;
}
