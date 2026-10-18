// Motor puro del auxiliar de inventario: traslado fiel de inventario-motor.js.
// La fuente de verdad son los movimientos vigentes. Stock, lotes y PPP se reconstruyen
// siempre desde el libro cronológico; nunca se editan a mano.

export type TipoMov = 'ENTRADA' | 'SALIDA' | 'TRASPASO' | 'AJUSTE_ENTRADA' | 'AJUSTE_SALIDA';
export interface LineaMov { id?: string; productoId: string; cantidad: number | string; costoUnitario?: number | string; lote?: string; fechaVencimiento?: string; [k: string]: unknown }
export interface Movimiento {
  id: string; folio?: string; tipo: TipoMov | string; fecha: string; creado?: string; estado?: string;
  bodegaOrigenId?: string | null; bodegaDestinoId?: string | null; lineas: LineaMov[]; tomaId?: string | null; [k: string]: unknown;
}
export interface Producto { id: string; codigo: string; descripcion: string; manejaLotes?: boolean; activo?: boolean; inventariable?: boolean; [k: string]: unknown }
export interface Bodega { id: string; codigo?: string; nombre?: string; activo?: boolean }
export interface Saldo { key: string; productoId: string; bodegaId: string; cantidad: number; costoPromedio: number; valor: number }
export interface SaldoLote extends Saldo { lote: string; fechaVencimiento: string }
export interface ErrorInv { tipo: string; movimientoId: string; folio?: string; productoId: string; bodegaId?: string; lote?: string; mensaje: string }

const n = (v: unknown) => (Number.isFinite(+(v as number)) ? +(v as number) : 0);
export const r6 = (v: unknown) => Math.round((n(v) + Number.EPSILON) * 1e6) / 1e6;
export const stockKey = (productoId: string, bodegaId: string) => `${productoId}|${bodegaId}`;
export const loteKey = (productoId: string, bodegaId: string, lote: string) => `${productoId}|${bodegaId}|${String(lote || '').trim().toUpperCase()}`;
const esEntrada = (t: string) => t === 'ENTRADA' || t === 'AJUSTE_ENTRADA';
const esSalida = (t: string) => t === 'SALIDA' || t === 'AJUSTE_SALIDA';

function ordenMov(a: Movimiento, b: Movimiento) {
  const fa = String(a.fecha || '') + '|' + String(a.creado || '') + '|' + String(a.folio || a.id || '');
  const fb = String(b.fecha || '') + '|' + String(b.creado || '') + '|' + String(b.folio || b.id || '');
  return fa.localeCompare(fb);
}

export function recalcularInventario(movimientos: Movimiento[] = [], productos: Producto[] = []) {
  const porProducto = new Map((productos || []).map((p) => [String(p.id), p]));
  const stock = new Map<string, Saldo>(), lotes = new Map<string, SaldoLote>(), valorizaciones = new Map<string, (LineaMov & { costoAplicado: number; valorAplicado: number })[]>();
  const errores: ErrorInv[] = [];
  const ensureStock = (pid: string, bid: string) => {
    const key = stockKey(pid, bid);
    if (!stock.has(key)) stock.set(key, { key, productoId: pid, bodegaId: bid, cantidad: 0, costoPromedio: 0, valor: 0 });
    return stock.get(key)!;
  };
  const ensureLote = (pid: string, bid: string, lote: string | undefined, vencimiento = '') => {
    const key = loteKey(pid, bid, lote || '');
    if (!lotes.has(key)) lotes.set(key, { key, productoId: pid, bodegaId: bid, lote: String(lote || '').trim().toUpperCase(), fechaVencimiento: vencimiento || '', cantidad: 0, costoPromedio: 0, valor: 0 });
    const l = lotes.get(key)!;
    if (vencimiento && !l.fechaVencimiento) l.fechaVencimiento = vencimiento;
    if (vencimiento && l.fechaVencimiento && l.fechaVencimiento !== vencimiento)
      errores.push({ tipo: 'VENCIMIENTO_LOTE', movimientoId: '', productoId: pid, bodegaId: bid, lote: l.lote, mensaje: `El lote ${l.lote} tiene fechas de vencimiento distintas` });
    return l;
  };
  const entrada = (st: Saldo, cant: number, costo: number) => {
    st.valor = r6(st.valor + cant * costo); st.cantidad = r6(st.cantidad + cant);
    st.costoPromedio = st.cantidad ? r6(st.valor / st.cantidad) : 0;
  };
  const salida = (st: Saldo, cant: number, m: Movimiento, ln: LineaMov, contexto = 'stock') => {
    const disponible = st.cantidad;
    if (cant > disponible + 1e-6) errores.push({ tipo: 'STOCK_NEGATIVO', movimientoId: m.id, folio: m.folio, productoId: ln.productoId, bodegaId: st.bodegaId, lote: contexto === 'lote' ? ln.lote || '' : '', mensaje: `${m.folio || m.id}: solicitado ${cant}, disponible ${disponible}` });
    const costo = st.costoPromedio;
    st.cantidad = r6(st.cantidad - cant); st.valor = r6(st.valor - cant * costo);
    if (Math.abs(st.cantidad) < 1e-6) { st.cantidad = 0; st.valor = 0; st.costoPromedio = 0; }
    return costo;
  };

  const vigentes = (movimientos || []).filter((m) => m && m.estado !== 'ANULADO').slice().sort(ordenMov);
  for (const m of vigentes) {
    const vals: (LineaMov & { costoAplicado: number; valorAplicado: number })[] = [];
    for (const ln of m.lineas || []) {
      const pid = String(ln.productoId || ''), cant = n(ln.cantidad), p = porProducto.get(pid);
      if (!pid || cant <= 0) continue;
      if (!p) { errores.push({ tipo: 'PRODUCTO_INEXISTENTE', movimientoId: m.id, productoId: pid, mensaje: `Producto ${pid} no existe` }); continue; }
      if (esEntrada(m.tipo)) {
        const costo = n(ln.costoUnitario);
        const st = ensureStock(pid, String(m.bodegaDestinoId));
        entrada(st, cant, costo);
        if (p.manejaLotes) { const lt = ensureLote(pid, String(m.bodegaDestinoId), ln.lote, ln.fechaVencimiento); entrada(lt, cant, costo); }
        vals.push({ ...ln, costoAplicado: costo, valorAplicado: r6(cant * costo) });
      } else if (esSalida(m.tipo)) {
        const st = ensureStock(pid, String(m.bodegaOrigenId)), costo = st.costoPromedio;
        if (p.manejaLotes) { const lt = ensureLote(pid, String(m.bodegaOrigenId), ln.lote, ln.fechaVencimiento); salida(lt, cant, m, ln, 'lote'); }
        salida(st, cant, m, ln);
        vals.push({ ...ln, costoAplicado: costo, valorAplicado: r6(cant * costo) });
      } else if (m.tipo === 'TRASPASO') {
        const origen = ensureStock(pid, String(m.bodegaOrigenId)), costo = origen.costoPromedio;
        if (p.manejaLotes) {
          const lo = ensureLote(pid, String(m.bodegaOrigenId), ln.lote, ln.fechaVencimiento);
          salida(lo, cant, m, ln, 'lote');
          entrada(ensureLote(pid, String(m.bodegaDestinoId), ln.lote, ln.fechaVencimiento), cant, costo);
        }
        salida(origen, cant, m, ln); entrada(ensureStock(pid, String(m.bodegaDestinoId)), cant, costo);
        vals.push({ ...ln, costoAplicado: costo, valorAplicado: r6(cant * costo) });
      }
    }
    valorizaciones.set(String(m.id), vals);
  }
  return {
    stock: [...stock.values()].sort((a, b) => (a.productoId + a.bodegaId).localeCompare(b.productoId + b.bodegaId)),
    lotes: [...lotes.values()].sort((a, b) => (a.productoId + a.bodegaId + a.lote).localeCompare(b.productoId + b.bodegaId + b.lote)),
    valorizaciones, errores,
  };
}
export type CalculoInv = ReturnType<typeof recalcularInventario>;

export function validarMovimiento(m: Movimiento, { productos = [] as Producto[], bodegas = [] as Bodega[], movimientos = [] as Movimiento[] } = {}) {
  const errores: string[] = [];
  const ps = new Map(productos.map((p) => [String(p.id), p]));
  const bs = new Set(bodegas.filter((b) => b.activo !== false).map((b) => String(b.id)));
  if (!['ENTRADA', 'SALIDA', 'TRASPASO', 'AJUSTE_ENTRADA', 'AJUSTE_SALIDA'].includes(m.tipo)) errores.push('Tipo de movimiento inválido');
  if (!m.fecha) errores.push('Falta la fecha');
  if (['SALIDA', 'TRASPASO', 'AJUSTE_SALIDA'].includes(m.tipo) && !bs.has(String(m.bodegaOrigenId || ''))) errores.push('Seleccione una bodega de origen activa');
  if (['ENTRADA', 'TRASPASO', 'AJUSTE_ENTRADA'].includes(m.tipo) && !bs.has(String(m.bodegaDestinoId || ''))) errores.push('Seleccione una bodega de destino activa');
  if (m.tipo === 'TRASPASO' && String(m.bodegaOrigenId) === String(m.bodegaDestinoId)) errores.push('La bodega de destino debe ser distinta de la bodega de origen');
  const lineas = (m.lineas || []).filter((l) => l && l.productoId && n(l.cantidad) > 0);
  if (!lineas.length) errores.push('Agregue al menos un producto con cantidad');
  for (const l of lineas) {
    const p = ps.get(String(l.productoId));
    if (!p) { errores.push(`Producto ${l.productoId} no existe`); continue; }
    if (p.activo === false) errores.push(`${p.descripcion}: producto inactivo`);
    if (esEntrada(m.tipo) && n(l.costoUnitario) <= 0) errores.push(`${p.descripcion}: indique un costo unitario mayor que cero`);
    if (p.manejaLotes && !String(l.lote || '').trim()) errores.push(`${p.descripcion}: indique el lote`);
    if (p.manejaLotes && esEntrada(m.tipo) && !l.fechaVencimiento) errores.push(`${p.descripcion}: indique la fecha de vencimiento`);
  }
  if (!errores.length && ['SALIDA', 'TRASPASO', 'AJUSTE_SALIDA'].includes(m.tipo)) {
    const base = recalcularInventario(movimientos, productos);
    const totalProd = new Map<string, number>(), totalLote = new Map<string, number>();
    for (const l of lineas) {
      const pid = String(l.productoId), lot = String(l.lote || '').trim().toUpperCase();
      totalProd.set(pid, n(totalProd.get(pid)) + n(l.cantidad));
      if (lot) totalLote.set(pid + '|' + lot, n(totalLote.get(pid + '|' + lot)) + n(l.cantidad));
    }
    for (const [pid, cant] of totalProd) {
      const p = ps.get(pid)!, bid = String(m.bodegaOrigenId);
      const st = base.stock.find((x) => x.productoId === pid && x.bodegaId === bid);
      if (cant > n(st?.cantidad) + 1e-6) errores.push(`${p.descripcion}: stock insuficiente en la bodega de origen`);
      if (p.manejaLotes) {
        for (const [clave, cantLote] of totalLote) {
          const [lp, ...resto] = clave.split('|'); if (lp !== pid) continue; const lot = resto.join('|');
          const lt = base.lotes.find((x) => x.productoId === pid && x.bodegaId === bid && x.lote === lot);
          if (cantLote > n(lt?.cantidad) + 1e-6) errores.push(`${p.descripcion}: saldo insuficiente en el lote ${lot}`);
        }
      }
    }
  } else if (!errores.length && esEntrada(m.tipo)) {
    const base = recalcularInventario(movimientos, productos), bid = String(m.bodegaDestinoId);
    for (const l of lineas) {
      const p = ps.get(String(l.productoId)); if (!p?.manejaLotes) continue;
      const lot = String(l.lote || '').trim().toUpperCase();
      const existente = base.lotes.find((x) => x.productoId === String(l.productoId) && x.bodegaId === bid && x.lote === lot && x.cantidad !== 0);
      if (existente?.fechaVencimiento && l.fechaVencimiento && existente.fechaVencimiento !== l.fechaVencimiento) errores.push(`${p.descripcion}: el lote ${lot} ya existe con vencimiento ${existente.fechaVencimiento}`);
    }
  }
  return { ok: errores.length === 0, errores, lineas };
}

/** Movimientos netos creados después del conteo (para no ajustar dos veces lo que entró o salió con la toma abierta). */
export function movimientosNetosDespues(movimientos: Movimiento[], { desde, productoId, bodegaId, lote = '', excluirTomaId = '' }: { desde: string | undefined | null; productoId: string; bodegaId: string; lote?: string; excluirTomaId?: string }) {
  const desdeMs = new Date(desde || 0).getTime(), pid = String(productoId), bid = String(bodegaId), lot = String(lote || '').trim().toUpperCase();
  let neto = 0;
  for (const m of movimientos || []) {
    if (!m || m.estado === 'ANULADO' || (excluirTomaId && String(m.tomaId || '') === String(excluirTomaId))) continue;
    const creadoMs = new Date(m.creado || m.fecha || 0).getTime();
    if (!Number.isFinite(creadoMs) || creadoMs <= desdeMs) continue;
    for (const l of m.lineas || []) {
      if (String(l.productoId) !== pid) continue;
      if (lot && String(l.lote || '').trim().toUpperCase() !== lot) continue;
      const cant = n(l.cantidad);
      if (esEntrada(m.tipo) && String(m.bodegaDestinoId) === bid) neto += cant;
      else if (esSalida(m.tipo) && String(m.bodegaOrigenId) === bid) neto -= cant;
      else if (m.tipo === 'TRASPASO') {
        if (String(m.bodegaOrigenId) === bid) neto -= cant;
        if (String(m.bodegaDestinoId) === bid) neto += cant;
      }
    }
  }
  return r6(neto);
}

export interface LineaToma { id: string; productoId: string; lote: string; fechaVencimiento: string; teoricoBase: number; costoBase: number; costoConteo?: number; fisico: number | null; contado: boolean; fisicoFecha?: string | null; contadoPor?: string; agregadaManual?: boolean }
export interface Toma { id: string; folio?: string; bodegaId: string; estado: string; version: number; lineas: LineaToma[]; creado?: string; cerrado?: string | null; [k: string]: unknown }

export function rebasarLineaToma(linea: LineaToma, toma: Toma, movimientos: Movimiento[], calculo: CalculoInv) {
  const pid = String(linea.productoId), bid = String(toma.bodegaId), lot = String(linea.lote || '').trim().toUpperCase();
  const actual = lot
    ? n((calculo?.lotes || []).find((x) => x.productoId === pid && x.bodegaId === bid && x.lote === lot)?.cantidad)
    : n((calculo?.stock || []).find((x) => x.productoId === pid && x.bodegaId === bid)?.cantidad);
  const posteriores = movimientosNetosDespues(movimientos, { desde: linea.fisicoFecha || toma.cerrado || toma.creado, productoId: pid, bodegaId: bid, lote: lot, excluirTomaId: toma.id });
  const objetivo = r6(n(linea.fisico) + posteriores);
  return { actual, posteriores, objetivo, diferencia: r6(objetivo - actual) };
}

// ── Órdenes de compra y recepciones (inventario-oc-motor.js) ──
export interface LineaOC { id: string; productoId: string; cantidad: number | string; precioUnitario: number | string; descuentoPct: number | string; aplicaIVA?: boolean }
export interface OrdenCompra {
  id: string; folio?: string; fecha: string; fechaEntrega?: string; proveedorRut: string; proveedorNombre: string; bodegaId: string;
  estado?: string; tasaIVA?: number; lineas: LineaOC[]; version?: number; [k: string]: unknown;
}
export interface LineaRecepcion { id?: string; ocLineaId: string; productoId?: string; cantidad: number | string; lote?: string; fechaVencimiento?: string; precioUnitario?: number; pendiente?: number }
export interface Recepcion { id?: string; ordenCompraId: string; fecha: string; documentoNumero: string; estado?: string; lineas: LineaRecepcion[]; [k: string]: unknown }

export const totalLineaOC = (l: LineaOC) => r6(n(l.cantidad) * n(l.precioUnitario) * (1 - n(l.descuentoPct) / 100));
export function calcularTotalesOC(oc: { lineas?: LineaOC[]; tasaIVA?: number } | null) {
  let netoAfecto = 0, netoExento = 0;
  for (const l of oc?.lineas || []) { const neto = totalLineaOC(l); if (l.aplicaIVA === false) netoExento += neto; else netoAfecto += neto; }
  netoAfecto = r6(netoAfecto); netoExento = r6(netoExento); const iva = r6(netoAfecto * n(oc?.tasaIVA ?? 19) / 100);
  return { netoAfecto, netoExento, neto: r6(netoAfecto + netoExento), iva, total: r6(netoAfecto + netoExento + iva) };
}
export function cantidadesRecibidas(ocId: string | undefined, recepciones: Recepcion[] = []) {
  const map = new Map<string, number>();
  for (const r of recepciones) { if (!r || r.estado === 'ANULADA' || String(r.ordenCompraId) !== String(ocId)) continue; for (const l of r.lineas || []) map.set(String(l.ocLineaId), r6(n(map.get(String(l.ocLineaId))) + n(l.cantidad))); }
  return map;
}
export function resumenRecepcionOC(oc: OrdenCompra | null | undefined, recepciones: Recepcion[] = []) {
  const recibidas = cantidadesRecibidas(oc?.id, recepciones); let pedida = 0, recibida = 0;
  const lineas = (oc?.lineas || []).map((l) => { const cantidad = n(l.cantidad), rec = n(recibidas.get(String(l.id))), pendiente = r6(Math.max(0, cantidad - rec)); pedida += cantidad; recibida += rec; return { ...l, recibida: rec, pendiente }; });
  return { lineas, pedida: r6(pedida), recibida: r6(recibida), pendiente: r6(Math.max(0, pedida - recibida)), avance: pedida ? Math.min(100, r6(recibida / pedida * 100)) : 0 };
}
export function validarOrdenCompra(oc: OrdenCompra, { productos = [] as Producto[], bodegas = [] as Bodega[], proveedores = [] as { rut: string }[] } = {}) {
  const errores: string[] = [], ps = new Map(productos.map((p) => [String(p.id), p]));
  if (!oc.fecha) errores.push('Indica la fecha de la orden');
  if (oc.fechaEntrega && oc.fecha && oc.fechaEntrega < oc.fecha) errores.push('La fecha esperada de entrega no puede ser anterior a la orden');
  if (!oc.proveedorRut || !oc.proveedorNombre) errores.push('Selecciona un proveedor');
  if (proveedores.length && !proveedores.some((p) => String(p.rut) === String(oc.proveedorRut))) errores.push('El proveedor ya no está disponible');
  if (!bodegas.some((b) => String(b.id) === String(oc.bodegaId) && b.activo !== false)) errores.push('Selecciona una bodega activa');
  const lineas = (oc.lineas || []).filter((l) => l && l.productoId && n(l.cantidad) > 0);
  if (!lineas.length) errores.push('Agrega al menos un producto con cantidad');
  const usados = new Set<string>();
  for (const l of lineas) {
    const p = ps.get(String(l.productoId)); if (!p) { errores.push('Hay un producto inexistente'); continue; }
    if (p.activo === false || p.inventariable === false) errores.push(`${p.descripcion}: producto no disponible para inventario`);
    if (usados.has(String(l.productoId))) errores.push(`${p.descripcion}: producto repetido en la orden`);
    usados.add(String(l.productoId));
    if (n(l.cantidad) <= 0) errores.push(`${p.descripcion}: cantidad inválida`);
    if (n(l.precioUnitario) <= 0) errores.push(`${p.descripcion}: el precio unitario debe ser mayor que cero`);
    if (n(l.descuentoPct) < 0 || n(l.descuentoPct) >= 100) errores.push(`${p.descripcion}: descuento fuera de rango`);
  }
  return { ok: errores.length === 0, errores, lineas };
}
export function validarRecepcion(recepcion: Recepcion, oc: OrdenCompra | null | undefined, { productos = [] as Producto[], recepciones = [] as Recepcion[] } = {}) {
  const errores: string[] = []; if (!oc) errores.push('La orden de compra no existe'); if (!recepcion.fecha) errores.push('Indica la fecha de recepción');
  if (oc && recepcion.fecha && recepcion.fecha < oc.fecha) errores.push('La recepción no puede ser anterior a la orden');
  if (!recepcion.documentoNumero) errores.push('Indica el número de guía, factura o documento');
  const pendientes = new Map(resumenRecepcionOC(oc, recepciones).lineas.map((l) => [String(l.id), l])), ps = new Map(productos.map((p) => [String(p.id), p]));
  const lineas = (recepcion.lineas || []).filter((l) => n(l.cantidad) > 0);
  if (!lineas.length) errores.push('Ingresa al menos una cantidad recibida');
  const sumas = new Map<string, number>(); for (const l of lineas) sumas.set(String(l.ocLineaId), r6(n(sumas.get(String(l.ocLineaId))) + n(l.cantidad)));
  for (const [id, cantidad] of sumas) { const base = pendientes.get(id); if (!base) { errores.push('La recepción contiene una línea que no pertenece a la orden'); continue; } const p = ps.get(String(base.productoId)); if (cantidad > n(base.pendiente) + 1e-6) errores.push(`${p?.descripcion || base.productoId}: recibido supera la cantidad pendiente`); }
  const lotesUsados = new Set<string>();
  for (const l of lineas) {
    const base = pendientes.get(String(l.ocLineaId)), p = base && ps.get(String(base.productoId));
    if (n(l.cantidad) <= 0) errores.push(`${p?.descripcion || 'Producto'}: cantidad inválida`);
    if (p?.manejaLotes && !String(l.lote || '').trim()) errores.push(`${p.descripcion}: indica lote`);
    if (p?.manejaLotes && !l.fechaVencimiento) errores.push(`${p.descripcion}: indica vencimiento`);
    if (p?.manejaLotes && String(l.lote || '').trim()) { const k = `${l.ocLineaId}|${String(l.lote).trim().toUpperCase()}`; if (lotesUsados.has(k)) errores.push(`${p.descripcion}: lote repetido en la recepción`); lotesUsados.add(k); }
  }
  return { ok: errores.length === 0, errores, lineas };
}
export function estadoSegunRecepciones(oc: OrdenCompra, recepciones: Recepcion[] = []) {
  if (['BORRADOR', 'ANULADA', 'CERRADA_PARCIAL'].includes(String(oc.estado))) return String(oc.estado);
  const r = resumenRecepcionOC(oc, recepciones); if (r.recibida <= 1e-6) return 'EMITIDA'; if (r.pendiente <= 1e-6) return 'RECIBIDA'; return 'PARCIAL';
}

// ── Conciliación recepción ↔ factura de compras (conciliacion-compras-motor.js) ──
const norm = (v: unknown) => String(v ?? '').trim().toUpperCase();
const normNumero = (v: unknown) => { const s = norm(v); return /^\d+$/.test(s) ? s.replace(/^0+(?=\d)/, '') : s; };
export interface DocCompra { id: string; tipoDTE: number; rut: string; folio: string; fecha: string; total: number; estado?: string | null }
/** Mismo tipo de DTE, mismo RUT y mismo N° (los ceros a la izquierda no cuentan). */
export function mismoDocumento(a: { tipoDTE?: number | null; proveedorRut?: string; rut?: string; documentoNumero?: string; folio?: string } | null, b: typeof a) {
  if (!a || !b) return false;
  const tA = +(a.tipoDTE || 0), tB = +(b.tipoDTE || 0); if (!tA || tA !== tB) return false;
  const rA = norm(a.proveedorRut ?? a.rut), rB = norm(b.proveedorRut ?? b.rut); if (!rA || rA !== rB) return false;
  const nA = normNumero(a.documentoNumero ?? a.folio), nB = normNumero(b.documentoNumero ?? b.folio); if (!nA || nA !== nB) return false;
  return true;
}
export function buscarCompraParaRecepcion(rec: { tipoDTE?: number | null; proveedorRut: string; documentoNumero: string }, compras: DocCompra[] = []) {
  if (!rec || ![33, 34].includes(+(rec.tipoDTE || 0))) return null;
  return compras.find((c) => c && c.estado !== 'anulado' && mismoDocumento(rec, c)) || null;
}
export function otrasRecepcionesMismoDocumento<T extends { id?: string; estado?: string; proveedorRut: string; documentoNumero: string; folio?: string }>(rec: T, recepciones: T[] = []) {
  if (!rec) return [];
  const rut = norm(rec.proveedorRut), numero = normNumero(rec.documentoNumero);
  if (!rut || !numero) return [];
  return recepciones.filter((r) => r && r.id !== rec.id && r.estado === 'VIGENTE' && norm(r.proveedorRut) === rut && normNumero(r.documentoNumero) === numero);
}
export function comprasVinculables(rec: { proveedorRut: string } | null, compras: DocCompra[] = []) {
  if (!rec) return [];
  const rut = norm(rec.proveedorRut); if (!rut) return [];
  return compras.filter((c) => c && c.estado !== 'anulado' && [33, 34].includes(+c.tipoDTE) && norm(c.rut) === rut).sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
}

// ── Folios correlativos por tipo: ENT-000001, SAL-000001… ──
export const FOLIO_PREFIJO: Record<string, string> = { ENTRADA: 'ENT', SALIDA: 'SAL', TRASPASO: 'TRA', AJUSTE_ENTRADA: 'AJE', AJUSTE_SALIDA: 'AJS', TOMA: 'TOMA', OC: 'OC', RECEPCION: 'REC' };
export function nuevoFolio(tipo: string, existentes: (string | null | undefined)[], extra: string[] = []) {
  const p = FOLIO_PREFIJO[tipo] || 'MOV';
  const re = new RegExp('^' + p + '-(\\d{6,})$');
  let max = 0;
  [...existentes, ...extra].forEach((f) => { const m = re.exec(String(f || '')); if (m) max = Math.max(max, +m[1]); });
  return `${p}-${String(max + 1).padStart(6, '0')}`;
}

export const MOTIVOS: Record<string, string[]> = {
  ENTRADA: ['COMPRA', 'DEVOLUCIÓN', 'PRODUCCIÓN', 'SALDO INICIAL', 'OTRA ENTRADA'],
  SALIDA: ['CONSUMO', 'VENTA', 'MERMA', 'DEVOLUCIÓN A PROVEEDOR', 'OTRA SALIDA'],
  TRASPASO: ['TRASPASO ENTRE BODEGAS'],
};
export const DOC_TIPOS_MOV = ['SIN DOCUMENTO', 'GUÍA DE DESPACHO', 'FACTURA AFECTA', 'FACTURA EXENTA', 'BOLETA', 'ORDEN DE COMPRA', 'ORDEN DE TRABAJO', 'SOLICITUD INTERNA', 'ACTA DE TOMA FÍSICA', 'OTRO'];
export const DOC_TIPOS_PROVEEDOR = ['GUÍA DE DESPACHO', 'FACTURA AFECTA', 'FACTURA EXENTA'];
export const TOMA_ESTADOS: Record<string, string> = { EN_PROCESO: 'En proceso', DEVUELTA: 'Devuelta', PENDIENTE_AUTORIZACION: 'Pendiente de autorización', RECHAZADA: 'Rechazada', APLICADA: 'Aplicada' };
export const OC_ESTADOS: Record<string, string> = { BORRADOR: 'Borrador', EMITIDA: 'Emitida', PARCIAL: 'Recepción parcial', RECIBIDA: 'Recibida completa', CERRADA_PARCIAL: 'Cerrada con saldo', ANULADA: 'Anulada' };
export const TIPOS_DOC_RECEPCION: Record<string, number | null> = { 'GUÍA': 52, 'FACTURA AFECTA': 33, 'FACTURA EXENTA': 34, OTRO: null };
export const CUENTA_INVENTARIO_FIJA = '1109007';
