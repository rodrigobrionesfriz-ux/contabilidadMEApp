// Datos del sistema anterior que no son libros contables (hoja "Datos" del respaldo, V2.22.13+): configuración de la
// empresa, parámetros de remuneraciones, trabajadores con sus anticipos, asistencia, libros de remuneraciones cerrados,
// finiquitos, contratos, fichas de clientes y proveedores, comprobantes tipo, renta, declaraciones juradas, activo fijo
// e inventario. Se convierten aquí al formato de las tablas; importar_datos (migración 0036) los escribe.

import { rutParse } from '@/motor/rut';
import { afCat } from '@/activo-fijo/depreciacion';

type O = Record<string, unknown>;
const esObj = (v: unknown): v is O => !!v && typeof v === 'object' && !Array.isArray(v);
const arr = (v: unknown): O[] => (Array.isArray(v) ? v.filter(esObj) : []);
const txt = (v: unknown) => (v == null ? '' : String(v)).trim();
const num = (v: unknown) => (v === '' || v == null || !Number.isFinite(Number(v)) ? 0 : Number(v));
const fecha = (v: unknown) => (/^\d{4}-\d{2}-\d{2}/.test(txt(v)) ? txt(v).slice(0, 10) : '');
const rutNorm = (v: unknown, dv?: unknown) => {
  const r = rutParse(dv != null && txt(dv) ? `${txt(v)}${txt(dv)}` : v);
  return r.valido ? `${r.codigo}-${r.dv}` : '';
};
const json = (datos: Map<string, string>, k: string): unknown => {
  try { return JSON.parse(datos.get(k) ?? 'null'); } catch { return null; }
};

export interface ExtrasImport {
  empresa: O | null;
  parametros: { indicadores?: O; previsional?: O; feriados?: O; previred?: O } | null;
  contratoDefaults: O | null;
  trabajadores: { ref: string; rut: string; nombre: string; activo: boolean; ficha: O }[];
  eventos: { trab: string; tipo: string; lic_tipo: string | null; desde: string; hasta: string; folio: string | null; obs: string | null }[] | null;
  horas: { periodo: string; trab: string; horas: number }[] | null;
  anticipos: { trab: string; fecha: string; monto: number; motivo: string | null; mes_desc: string }[];
  libros: { periodo: string; uf: number; utm: number; lineas: O[]; totales: O; cerrado_en: string | null }[];
  finiquitos: { trab: string; fecha_termino: string; causal: string; datos: O; calc: O; total: number; texto: string | null; estado: string }[];
  finiquitoPlantillas: { codigo: string; nombre: string; causal: string; texto: string }[];
  contratos: { trab: string; plantilla: string | null; texto: string | null }[];
  contratoPlantillas: { codigo: string; nombre: string; cargos: string; tipo_contrato: number | null; texto: string }[];
  auxiliares: { tipo: 'cliente' | 'proveedor'; rut: string; razon_social: string; giro: string | null; email: string | null; telefono: string | null; direccion: string | null; cuenta: string | null; centro_costo: string | null; forma_pago: string | null }[];
  comprobantesTipo: { nombre: string; descripcion: string; glosa: string; guarda_montos: boolean; lineas: O[]; dist_activa: boolean; dist_base: number; dist: O[] }[];
  renta: { anio: number; datos: O }[];
  djCatalogo: unknown[] | null;
  djEstados: { anio_tributario: number; estados: O }[];
  activos: { descripcion: string; categoria: string; fecha: string; cuenta_activo: string; cuenta_depr_acum: string; cuenta_gasto: string; ficha: O; estado: string }[];
  inventario: InventarioImport | null;
  /** Qué trae el respaldo, para mostrarlo antes de importar */
  resumen: Record<string, number>;
}

export interface InventarioImport { ops: { tabla: string; accion: 'insert'; fila: O }[]; conteo: Record<string, number> }

const REGIMENES = new Set(['14D3', '14D8', '14A', '34AGRI', '34TRANS', '34MIN', 'NOSUJ']);
const CATS_AF = new Set(['bienes_raices', 'maquinarias', 'instalaciones', 'vehiculos', 'equipos_ofic']);

/**
 * @param centros mapa id del sistema anterior → código del centro de costo (hoja CentrosCosto)
 */
export function extrasDesdeDatos(datos: Map<string, string>, anio: number, centros: Map<string, string> = new Map(), nuevoId: () => string = () => crypto.randomUUID()): ExtrasImport {
  const cc = (v: unknown) => (txt(v) ? centros.get(txt(v)) ?? (/^[0-9A-Za-z._-]+$/.test(txt(v)) && [...centros.values()].includes(txt(v)) ? txt(v) : null) : null);
  const per = (p: unknown) => /^\d{4}-(0[1-9]|1[0-2])$/.test(txt(p)) ? txt(p) : '';
  const delAnio = (p: string) => p.startsWith(`${anio}-`);

  // ── Empresa ──
  const emp = json(datos, 'empresa');
  let empresa: O | null = null, parametros: ExtrasImport['parametros'] = null, contratoDefaults: O | null = null;
  if (esObj(emp)) {
    empresa = {};
    for (const [k, c] of [['giro', 'giro'], ['domicilio', 'domicilio'], ['comuna', 'comuna'], ['ciudad', 'ciudad'], ['rep', 'representante']] as const) if (txt(emp[k])) empresa[c] = txt(emp[k]);
    const rr = rutNorm(emp.rutrep); if (rr) empresa.rut_representante = rr;
    if (REGIMENES.has(txt(emp.regimen))) empresa.regimen = txt(emp.regimen);
    if (txt(emp.tasaRenta) !== '' && Number.isFinite(Number(emp.tasaRenta))) empresa.tasa_renta = Number(emp.tasaRenta);
    parametros = {};
    for (const k of ['indicadores', 'previsional', 'feriados', 'previred'] as const) if (esObj(emp[k])) parametros[k] = emp[k] as O;
    if (!Object.keys(parametros).length) parametros = null;
    if (esObj(emp.contratoDT)) contratoDefaults = emp.contratoDT as O;
  }

  // ── Trabajadores (la ficha es el mismo objeto del sistema anterior; los anticipos van a su tabla) ──
  const trabs = arr(json(datos, 'trabajadores'));
  const trabajadores: ExtrasImport['trabajadores'] = [];
  const anticipos: ExtrasImport['anticipos'] = [];
  for (const t of trabs) {
    const rut = rutNorm(t.rut), ref = txt(t.id);
    if (!rut || !ref || !txt(t.nombre)) continue;
    const ficha: O = { ...t };
    for (const k of ['id', 'rut', 'nombre', 'anticipos', 'activo']) delete ficha[k];
    trabajadores.push({ ref, rut, nombre: txt(t.nombre), activo: t.activo !== false, ficha });
    for (const a of arr(t.anticipos)) {
      const f = fecha(a.fecha), mes = per(a.mesDesc) || f.slice(0, 7);
      if (!f || !(num(a.monto) > 0) || !delAnio(mes)) continue;
      anticipos.push({ trab: ref, fecha: f, monto: Math.round(num(a.monto)), motivo: txt(a.motivo) || null, mes_desc: mes });
    }
  }
  const conTrab = new Set(trabajadores.map((t) => t.ref));

  // ── Asistencia: eventos que tocan el año y horas del año ──
  const asis = json(datos, 'asistencia');
  let eventos: ExtrasImport['eventos'] = null, horas: ExtrasImport['horas'] = null;
  if (esObj(asis)) {
    eventos = arr(asis.eventos).filter((e) => conTrab.has(txt(e.trab)) && fecha(e.desde))
      .map((e) => ({ trab: txt(e.trab), tipo: txt(e.tipo), lic_tipo: txt(e.licTipo) || null, desde: fecha(e.desde), hasta: fecha(e.hasta) || fecha(e.desde), folio: txt(e.folio) || null, obs: txt(e.obs) || null }))
      .filter((e) => e.desde <= `${anio}-12-31` && e.hasta >= `${anio}-01-01`);
    horas = [];
    if (esObj(asis.horas)) for (const [p, m] of Object.entries(asis.horas)) {
      if (!delAnio(per(p)) || !esObj(m)) continue;
      for (const [t, h] of Object.entries(m)) if (conTrab.has(t) && num(h) > 0) horas.push({ periodo: p, trab: t, horas: num(h) });
    }
  }

  // ── Libros de remuneraciones cerrados del año (las líneas llevan el id del trabajador) ──
  const libros: ExtrasImport['libros'] = [];
  const lr = json(datos, 'libroRem');
  if (esObj(lr)) for (const [p, l] of Object.entries(lr)) {
    if (!delAnio(per(p)) || !esObj(l) || !Array.isArray(l.lineas) || !(num(l.uf) > 0)) continue;
    libros.push({ periodo: p, uf: num(l.uf), utm: Math.round(num(l.utm)), lineas: arr(l.lineas), totales: esObj(l.totales) ? l.totales : {}, cerrado_en: txt(l.cerradoEl) || null });
  }

  // ── Finiquitos y contratos ──
  const fin = json(datos, 'finiquitos');
  const finiquitos: ExtrasImport['finiquitos'] = [];
  const finiquitoPlantillas: ExtrasImport['finiquitoPlantillas'] = [];
  if (esObj(fin)) {
    for (const f of arr(fin.items)) {
      if (!conTrab.has(txt(f.trab)) || !fecha(f.fechaTermino) || !esObj(f.calc)) continue;
      const d: O = { ...f };
      for (const k of ['id', 'calc', 'estado', 'creado', 'actualizado', 'texto', 'asientoId', 'ratificadoEn']) delete d[k];
      finiquitos.push({ trab: txt(f.trab), fecha_termino: fecha(f.fechaTermino), causal: txt(f.causal), datos: d, calc: f.calc as O, total: Math.round(num((f.calc as O).total)),
        texto: txt(f.texto) || null, estado: f.estado === 'ratificado' ? 'ratificado' : 'borrador' });
    }
    for (const p of arr(fin.plantillas)) if (txt(p.id) && txt(p.nombre) && txt(p.texto)) finiquitoPlantillas.push({ codigo: txt(p.id), nombre: txt(p.nombre), causal: txt(p.causal), texto: String(p.texto) });
  }
  const ct = json(datos, 'contratosTrab');
  const contratos: ExtrasImport['contratos'] = [];
  const contratoPlantillas: ExtrasImport['contratoPlantillas'] = [];
  if (esObj(ct)) {
    if (esObj(ct.items)) for (const [t, it] of Object.entries(ct.items)) if (conTrab.has(t) && esObj(it)) contratos.push({ trab: t, plantilla: txt(it.plantillaId) || null, texto: txt(it.texto) ? String(it.texto) : null });
    for (const p of arr(ct.plantillas)) if (txt(p.id) && txt(p.nombre) && txt(p.texto))
      contratoPlantillas.push({ codigo: txt(p.id), nombre: txt(p.nombre), cargos: txt(p.cargos), tipo_contrato: [1, 2, 3].includes(num(p.tipoContrato)) ? num(p.tipoContrato) : null, texto: String(p.texto) });
  }

  // ── Fichas de clientes y proveedores ──
  const fichas = json(datos, 'fichasAux');
  const auxiliares: ExtrasImport['auxiliares'] = [];
  if (esObj(fichas)) for (const tipo of ['cliente', 'proveedor'] as const) {
    const g = fichas[tipo];
    if (!esObj(g)) continue;
    for (const [k, f] of Object.entries(g)) {
      if (!esObj(f)) continue;
      const rut = rutNorm(f.rutCodigo ?? k, f.rutDV);
      if (!rut || !txt(f.razonSocial)) continue;
      const fp = txt(f.formaPago ?? f.fp);
      auxiliares.push({ tipo, rut, razon_social: txt(f.razonSocial), giro: txt(f.giro) || null, email: txt(f.email) || null, telefono: txt(f.telefono) || null,
        direccion: txt(f.direccion) || null, cuenta: txt(f.cuentaDefault ?? f.cuenta) || null, centro_costo: cc(f.ccDefault ?? f.cc),
        forma_pago: tipo === 'cliente' && ['clientes', 'banco', 'deudores', 'tarjetas'].includes(fp) ? fp : null });
    }
  }

  // ── Comprobantes tipo (los centros de costo pasan de id a código) ──
  const comprobantesTipo = arr(json(datos, 'comprobantesTipo')).filter((c) => txt(c.nombre)).map((c) => ({
    nombre: txt(c.nombre), descripcion: txt(c.descripcion), glosa: txt(c.glosa), guarda_montos: !!c.guardaMontos,
    lineas: arr(c.lineas).map((l) => ({ ...l, cc: cc(l.cc) ?? '' })), dist_activa: !!c.distActiva, dist_base: Math.round(num(c.distBase)),
    dist: arr(c.dist).map((l) => ({ ...l, cc: cc(l.cc) ?? '' })),
  }));

  // ── Renta y declaraciones juradas ──
  const renta: ExtrasImport['renta'] = [];
  const djEstados: ExtrasImport['djEstados'] = [];
  for (const [k] of datos) {
    const m = /^renta-(\d{4})$/.exec(k), d = /^dj_estado-(\d{4})$/.exec(k);
    const v = json(datos, k);
    if (m && esObj(v)) renta.push({ anio: +m[1], datos: v });
    if (d && esObj(v)) djEstados.push({ anio_tributario: +d[1], estados: v });
  }
  const djc = json(datos, 'dj_catalogo');
  const djCatalogo = Array.isArray(djc) ? djc : null;

  // ── Activo fijo ──
  const activos = arr(json(datos, 'activos')).filter((a) => txt(a.desc) && fecha(a.fecha) && num(a.valor || a.valorContable) > 0).map((a) => {
    const c = afCat(CATS_AF.has(txt(a.cat)) ? txt(a.cat) : 'maquinarias');
    const valor = num(a.valorContable) || num(a.valor), vt = num(a.valorTributario) || valor;
    const ficha: O = {
      cat: c.k, fecha: fecha(a.fecha), valor, residual: num(a.residualContable ?? a.residual),
      valorContable: valor, residualContable: num(a.residualContable ?? a.residual), vidaContable: num(a.vidaContable) || num(a.vida) || c.vida,
      metodoContable: txt(a.metodoContable) || 'lineal', fechaInicioDepContable: fecha(a.fechaInicioDepContable) || fecha(a.fecha),
      valorTributario: vt, residualTributario: num(a.residualTributario), vidaTributaria: num(a.vidaTributaria) || num(a.vida) || c.vida,
      metodoTributario: txt(a.metodoTributario) || txt(a.metodo) || 'lineal', fechaInicioDepTributaria: fecha(a.fechaInicioDepTributaria) || fecha(a.fecha),
      vida: num(a.vidaTributaria) || num(a.vida) || c.vida, metodo: txt(a.metodoTributario) || txt(a.metodo) || 'lineal',
    };
    return { descripcion: txt(a.desc), categoria: c.k, fecha: fecha(a.fecha), cuenta_activo: txt(a.cuentaActivo) || c.activo, cuenta_depr_acum: txt(a.cuentaDeprAcum) || c.deprAcum,
      cuenta_gasto: txt(a.cuentaGasto) || c.gasto, ficha, estado: a.anulado || a.estado === 'anulado' ? 'anulado' : 'vigente' };
  });

  const inventario = inventarioDesdeDatos(datos, nuevoId);

  const resumen: Record<string, number> = {
    trabajadores: trabajadores.length, anticipos: anticipos.length, eventos: eventos?.length ?? 0, libros: libros.length, finiquitos: finiquitos.length,
    contratos: contratos.length, plantillas: finiquitoPlantillas.length + contratoPlantillas.length, fichas: auxiliares.length, comprobantesTipo: comprobantesTipo.length,
    renta: renta.length, dj: djEstados.length, activos: activos.length, inventario: inventario ? inventario.ops.length : 0,
  };
  return { empresa, parametros, contratoDefaults, trabajadores, eventos, horas, anticipos, libros, finiquitos, finiquitoPlantillas, contratos, contratoPlantillas,
    auxiliares, comprobantesTipo, renta, djCatalogo, djEstados, activos, inventario, resumen };
}

// ── Inventario: los registros del sistema anterior tienen la misma forma (camelCase) que los del motor de este sistema.
// Se les asigna un id nuevo (uuid) y se reemplazan todas las referencias (…Id, lineas[].productoId, movimientosAjuste…).
const COLUMNAS: Record<string, string[]> = {
  inv_grupos: ['id', 'nombre', 'subgrupos', 'activo'],
  inv_bodegas: ['id', 'codigo', 'nombre', 'direccion', 'activo'],
  inv_productos: ['id', 'codigo', 'ean', 'descripcion', 'tipo', 'unidad', 'grupoId', 'subgrupo', 'stockMinimo', 'cuentaInventario', 'cuentaCosto', 'aplicaIVA', 'manejaLotes', 'inventariable', 'activo'],
  inv_ordenes_compra: ['id', 'folio', 'fecha', 'fechaEntrega', 'proveedorRut', 'proveedorNombre', 'bodegaId', 'centroCosto', 'condicionPago', 'observaciones', 'tasaIVA', 'lineas', 'estado', 'version', 'motivoAnulacion', 'creado', 'creadoPor', 'modificado', 'modificadoPor'],
  inv_recepciones: ['id', 'folio', 'ordenCompraId', 'proveedorRut', 'proveedorNombre', 'bodegaId', 'fecha', 'documentoTipo', 'tipoDTE', 'documentoNumero', 'estadoContable', 'conciliadoManual', 'observaciones', 'lineas', 'estado', 'motivoAnulacion', 'creado', 'creadoPor'],
  inv_tomas: ['id', 'folio', 'bodegaId', 'alcance', 'grupoId', 'observaciones', 'estado', 'version', 'lineas', 'motivo', 'movimientosAjuste', 'creado', 'creadoPor', 'cerrado', 'cerradoPor', 'resuelto', 'resueltoPor'],
  inv_movimientos: ['id', 'folio', 'tipo', 'fecha', 'motivo', 'bodegaOrigenId', 'bodegaDestinoId', 'tercero', 'documentoTipo', 'documentoNumero', 'documento', 'proveedorRut', 'proveedorNombre',
    'ordenCompraId', 'recepcionId', 'tomaId', 'centroCosto', 'observaciones', 'lineas', 'estado', 'motivoAnulacion', 'anulado', 'anuladoPor', 'creado', 'creadoPor', 'editado', 'editadoPor'],
};
const ESPECIALES: Record<string, string> = { aplicaIVA: 'aplica_iva', tasaIVA: 'tasa_iva', tipoDTE: 'tipo_dte' };
const snake = (k: string) => ESPECIALES[k] || k.replace(/[A-Z]/g, (x) => '_' + x.toLowerCase());

export function inventarioDesdeDatos(datos: Map<string, string>, nuevoId: () => string = () => crypto.randomUUID()): InventarioImport | null {
  const fuentes: [string, string][] = [['inv_grupos', 'inv-grupos'], ['inv_bodegas', 'inv-bodegas'], ['inv_productos', 'inv-productos'],
    ['inv_ordenes_compra', 'inv-ordenes-compra'], ['inv_recepciones', 'inv-recepciones'], ['inv_tomas', 'inv-tomas'], ['inv_movimientos', 'inv-movimientos']];
  const regs = fuentes.map(([t, k]) => [t, arr(json(datos, k))] as const);
  if (!regs.some(([, r]) => r.length)) return null;
  const ids = new Map<string, string>();
  for (const [, rs] of regs) for (const r of rs) if (txt(r.id)) ids.set(txt(r.id), nuevoId());
  const remap = (v: unknown, k = ''): unknown => {
    if (Array.isArray(v)) return v.map((x) => remap(x, k));
    if (esObj(v)) return Object.fromEntries(Object.entries(v).map(([kk, x]) => [kk, remap(x, kk)]));
    if (typeof v === 'string' && (k === 'id' || /Id$/.test(k) || k === 'movimientosAjuste') && ids.has(v)) return ids.get(v);
    if (typeof v === 'string' && (k === 'id' || /Id$/.test(k)) && v && !ids.has(v) && k !== 'id') return null; // referencia a algo que no viene (p. ej. una compra)
    return v;
  };
  const ops: InventarioImport['ops'] = [];
  const conteo: Record<string, number> = {};
  for (const [tabla, rs] of regs) {
    for (const r of rs) {
      if (!txt(r.id)) continue;
      const o = remap(r) as O;
      const fila: O = {};
      for (const k of COLUMNAS[tabla]) if (k in o && o[k] !== undefined) fila[snake(k)] = o[k];
      for (const k of ['fecha', 'fecha_entrega']) if (typeof fila[k] === 'string') fila[k] = (fila[k] as string).slice(0, 10) || null;
      ops.push({ tabla, accion: 'insert', fila });
    }
    conteo[tabla] = rs.length;
  }
  return { ops, conteo };
}
