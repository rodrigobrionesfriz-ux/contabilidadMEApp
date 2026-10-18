'use server';

import { revalidatePath } from 'next/cache';
import { crearClienteServidor } from '@/lib/supabase/server';
import { requerirEmpresa, requerirUsuario, puedeEscribir } from '@/lib/auth';
import { datosInventario, apoyoInventario, type DatosInventario } from '@/lib/datos/inventario';
import { aSnake } from '@/inventario/filas';
import {
  recalcularInventario, validarMovimiento, rebasarLineaToma, validarOrdenCompra, validarRecepcion, estadoSegunRecepciones,
  buscarCompraParaRecepcion, otrasRecepcionesMismoDocumento, FOLIO_PREFIJO, MOTIVOS, DOC_TIPOS_MOV, DOC_TIPOS_PROVEEDOR,
  TIPOS_DOC_RECEPCION, CUENTA_INVENTARIO_FIJA, r6, type LineaMov, type LineaToma, type LineaOC, type Movimiento, type Producto,
} from '@/inventario/motor';
import { prepararImportacionProductos, TIPOS, UNIDADES } from '@/inventario/importador';

type Res = { ok: true; mensaje: string; id?: string } | { ok: false; error: string };
type Op = { tabla: string; accion: 'insert' | 'update'; fila: Record<string, unknown>; folio?: string; ref?: string; version?: number };
const n = (v: unknown) => (Number.isFinite(+(v as number)) ? +(v as number) : 0);
const uid = () => crypto.randomUUID();
const ahora = () => new Date().toISOString();
const hoy = () => new Date().toISOString().slice(0, 10);
const esFecha = (s: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const MAYUS = (s: unknown) => String(s ?? '').trim().toUpperCase();

async function contexto(empresaId: string) {
  const empresa = await requerirEmpresa(empresaId);
  if (!puedeEscribir(empresa.rol)) throw new Error('No tienes permiso para modificar el inventario.');
  const [usuario, datos] = await Promise.all([requerirUsuario(), datosInventario(empresaId)]);
  return { usuario: usuario.email, datos };
}
async function aplicar(empresaId: string, version: number | null, ops: Op[]) {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('inv_aplicar', { p_empresa: empresaId, p_version: version, p_ops: ops });
  if (error) {
    const m = error.message;
    if (/inv_productos_empresa_id_codigo_key/.test(m)) throw new Error('El código interno ya existe.');
    if (/inv_productos_ean/.test(m)) throw new Error('El código EAN ya está asignado a otro producto.');
    if (/inv_bodegas_empresa_id_codigo_key/.test(m)) throw new Error('Ese código de bodega ya existe.');
    if (/inv_grupos_empresa_id_nombre_key/.test(m)) throw new Error('Ese grupo ya existe.');
    if (/inv_tomas_abierta/.test(m)) throw new Error('Ya existe una toma abierta o pendiente para esa bodega.');
    if (/cuenta_costo/.test(m) && /foreign key/i.test(m)) throw new Error('La cuenta de gasto/consumo no existe en el plan de cuentas.');
    throw new Error(m);
  }
  revalidatePath(`/e/${empresaId}/inventario`);
  return data as { version: number; folios: Record<string, string> };
}
async function correr(fn: () => Promise<Res>): Promise<Res> {
  try { return await fn(); } catch (e) { return { ok: false, error: (e as Error).message }; }
}
const productosMotor = (d: DatosInventario) => d.productos as unknown as Producto[];
const movsMotor = (d: DatosInventario) => d.movimientos as unknown as Movimiento[];

// ── Maestros ──
export async function guardarGrupo(empresaId: string, id: string | null, f: { nombre: string; subgrupos: string }): Promise<Res> {
  return correr(async () => {
    const { datos } = await contexto(empresaId);
    const nombre = MAYUS(f.nombre);
    const subgrupos = [...new Set(String(f.subgrupos || '').split(',').map(MAYUS).filter(Boolean))];
    if (!nombre) return { ok: false, error: 'Indica el nombre del grupo.' };
    if (datos.grupos.some((g) => g.id !== id && g.nombre === nombre)) return { ok: false, error: 'Ese grupo ya existe.' };
    if (id && !datos.grupos.some((g) => g.id === id)) return { ok: false, error: 'El grupo ya no existe.' };
    const fila = { id: id || uid(), nombre, subgrupos, activo: true, actualizado: ahora() };
    await aplicar(empresaId, null, [{ tabla: 'inv_grupos', accion: id ? 'update' : 'insert', fila }]);
    return { ok: true, mensaje: 'Grupo guardado.' };
  });
}

export async function guardarBodega(empresaId: string, id: string | null, f: { codigo: string; nombre: string; direccion: string; activo: boolean }): Promise<Res> {
  return correr(async () => {
    const { datos } = await contexto(empresaId);
    const codigo = MAYUS(f.codigo), nombre = MAYUS(f.nombre);
    if (!codigo || !nombre) return { ok: false, error: 'Completa código y nombre.' };
    if (datos.bodegas.some((b) => b.id !== id && b.codigo === codigo)) return { ok: false, error: 'Ese código de bodega ya existe.' };
    const fila = { id: id || uid(), codigo, nombre, direccion: String(f.direccion || '').trim(), activo: !!f.activo, actualizado: ahora() };
    await aplicar(empresaId, null, [{ tabla: 'inv_bodegas', accion: id ? 'update' : 'insert', fila }]);
    return { ok: true, mensaje: 'Bodega guardada.' };
  });
}

export interface FormProducto {
  codigo: string; ean: string; descripcion: string; tipo: string; unidad: string; grupoId: string; subgrupo: string; stockMinimo: number;
  cuentaCosto: string; aplicaIVA: boolean; manejaLotes: boolean; inventariable: boolean; activo: boolean;
}
export async function guardarProducto(empresaId: string, id: string | null, f: FormProducto): Promise<Res> {
  return correr(async () => {
    const [{ datos }, apoyo] = await Promise.all([contexto(empresaId), apoyoInventario(empresaId)]);
    const viejo = id ? datos.productos.find((p) => p.id === id) : null;
    if (id && !viejo) return { ok: false, error: 'El producto ya no existe.' };
    const codigo = viejo ? viejo.codigo : MAYUS(f.codigo), descripcion = MAYUS(f.descripcion), ean = String(f.ean || '').trim();
    if (!codigo || !descripcion) return { ok: false, error: 'Completa código y descripción.' };
    if (datos.productos.some((p) => p.id !== id && p.codigo === codigo)) return { ok: false, error: 'El código interno ya existe.' };
    if (ean && datos.productos.some((p) => p.id !== id && p.ean === ean)) return { ok: false, error: 'El código EAN ya está asignado.' };
    if (!TIPOS.includes(f.tipo) || !UNIDADES.includes(f.unidad)) return { ok: false, error: 'Tipo o unidad inválidos.' };
    if (!f.cuentaCosto) return { ok: false, error: 'Selecciona la cuenta de gasto/consumo.' };
    if (!apoyo.cuentasGasto.some((c) => c.codigo === f.cuentaCosto)) return { ok: false, error: 'La cuenta de gasto/consumo debe ser una cuenta de gasto del plan de cuentas.' };
    const grupo = f.grupoId ? datos.grupos.find((g) => g.id === f.grupoId) : null;
    if (f.grupoId && !grupo) return { ok: false, error: 'El grupo ya no existe.' };
    const tieneMov = viejo && datos.movimientos.some((m) => (m.lineas || []).some((l) => l.productoId === viejo.id));
    const manejaLotes = tieneMov ? viejo!.manejaLotes : !!f.manejaLotes;
    if (!(n(f.stockMinimo) >= 0)) return { ok: false, error: 'Stock mínimo inválido.' };
    const fila = {
      id: id || uid(), codigo, ean, descripcion, tipo: f.tipo, unidad: f.unidad, grupo_id: grupo?.id || null, subgrupo: grupo && grupo.subgrupos.includes(f.subgrupo) ? f.subgrupo : '',
      stock_minimo: n(f.stockMinimo), cuenta_inventario: CUENTA_INVENTARIO_FIJA, cuenta_costo: f.cuentaCosto, aplica_iva: !!f.aplicaIVA, maneja_lotes: manejaLotes,
      inventariable: !!f.inventariable, activo: !!f.activo, actualizado: ahora(),
    };
    await aplicar(empresaId, null, [{ tabla: 'inv_productos', accion: id ? 'update' : 'insert', fila }]);
    return { ok: true, mensaje: 'Producto guardado.' };
  });
}

export async function importarProductos(empresaId: string, filas: unknown[][], actualizar: boolean): Promise<Res> {
  return correr(async () => {
    const [{ datos }, apoyo] = await Promise.all([contexto(empresaId), apoyoInventario(empresaId)]);
    const usados = new Set<string>(); for (const m of datos.movimientos) for (const l of m.lineas || []) usados.add(String(l.productoId));
    const gasto = new Set(apoyo.cuentasGasto.map((c) => c.codigo));
    const r = prepararImportacionProductos(filas, { productos: datos.productos, actualizar, cuentaGastoExiste: (c) => gasto.has(c), cuentaInventarioFija: CUENTA_INVENTARIO_FIJA, productosConMovimientos: [...usados] });
    if (r.resumen.errores) return { ok: false, error: 'Los datos cambiaron desde la vista previa o hay filas con error. Revisa y vuelve a importar.' };
    const grupos = datos.grupos.map((g) => ({ ...g, subgrupos: [...g.subgrupos], nuevo: false, cambiado: false }));
    const ops: Op[] = [];
    const filasProd: Op[] = [];
    for (const x of r.filas) {
      if (x.estado !== 'NUEVO' && x.estado !== 'ACTUALIZA') continue;
      const p = x.producto;
      let grupoId: string | null = null;
      if (p.grupoNombre) {
        let g = grupos.find((y) => y.nombre.toUpperCase() === p.grupoNombre);
        if (!g) { g = { id: uid(), nombre: p.grupoNombre, subgrupos: [], activo: true, nuevo: true, cambiado: true }; grupos.push(g); }
        if (p.subgrupo && !g.subgrupos.some((s) => s.toUpperCase() === p.subgrupo)) { g.subgrupos.push(p.subgrupo); g.subgrupos.sort(); g.cambiado = true; }
        grupoId = g.id;
      }
      const fila = { codigo: p.codigo, ean: p.ean, descripcion: p.descripcion, tipo: p.tipo, unidad: p.unidad, grupo_id: grupoId, subgrupo: p.subgrupo, stock_minimo: p.stockMinimo,
        cuenta_inventario: p.cuentaInventario, cuenta_costo: p.cuentaCosto, aplica_iva: p.aplicaIVA, maneja_lotes: p.manejaLotes, inventariable: p.inventariable, activo: p.activo, actualizado: ahora() };
      filasProd.push(x.estado === 'ACTUALIZA' ? { tabla: 'inv_productos', accion: 'update', fila: { ...fila, id: p.id } } : { tabla: 'inv_productos', accion: 'insert', fila: { ...fila, id: uid() } });
    }
    for (const g of grupos.filter((y) => y.cambiado)) ops.push({ tabla: 'inv_grupos', accion: g.nuevo ? 'insert' : 'update', fila: { id: g.id, nombre: g.nombre, subgrupos: g.subgrupos, activo: true, actualizado: ahora() } });
    // Los lotes de 300 filas evitan una sola llamada enorme; el control de versión no aplica a maestros.
    ops.push(...filasProd);
    for (let i = 0; i < ops.length; i += 300) await aplicar(empresaId, null, ops.slice(i, i + 300));
    return { ok: true, mensaje: `${r.resumen.nuevos} producto(s) creados · ${r.resumen.actualiza} actualizado(s).` };
  });
}

// ── Movimientos ──
export interface BorradorMov {
  tipo: string; fecha: string; motivo: string; bodegaOrigenId: string; bodegaDestinoId: string; tercero: string; documentoTipo: string; documentoNumero: string;
  proveedorRut: string; proveedorNombre: string; ordenCompraId: string; centroCosto: string; observaciones: string;
  lineas: { productoId: string; cantidad: number | string; costoUnitario?: number | string; lote?: string; fechaVencimiento?: string }[];
}
export async function guardarMovimiento(empresaId: string, version: number, editId: string | null, d: BorradorMov): Promise<Res> {
  return correr(async () => {
    const { usuario, datos } = await contexto(empresaId);
    if (!['ENTRADA', 'SALIDA', 'TRASPASO'].includes(d.tipo)) return { ok: false, error: 'Tipo de movimiento inválido.' };
    if (!MOTIVOS[d.tipo].includes(d.motivo)) return { ok: false, error: 'Motivo inválido.' };
    if (!DOC_TIPOS_MOV.includes(d.documentoTipo)) return { ok: false, error: 'Tipo de documento inválido.' };
    if (!esFecha(d.fecha)) return { ok: false, error: 'Falta la fecha.' };
    if (d.documentoTipo !== 'SIN DOCUMENTO' && !String(d.documentoNumero || '').trim()) return { ok: false, error: 'Indica el N° de documento.' };
    const conProveedor = d.tipo === 'ENTRADA' && DOC_TIPOS_PROVEEDOR.includes(d.documentoTipo);
    if (conProveedor) {
      if (!d.proveedorRut) return { ok: false, error: 'Selecciona el proveedor.' };
      if (d.ordenCompraId && !datos.ordenes.some((o) => o.id === d.ordenCompraId && o.proveedorRut === d.proveedorRut)) return { ok: false, error: 'La orden de compra no corresponde al proveedor.' };
      if (!d.ordenCompraId) {
        const conOC = new Set(datos.ordenes.filter((o) => ['EMITIDA', 'PARCIAL'].includes(o.estado) && o.proveedorRut === d.proveedorRut).flatMap((o) => o.lineas.map((l) => String(l.productoId))));
        const conflicto = [...new Set(d.lineas.filter((l) => l.productoId).map((l) => String(l.productoId)))].filter((pid) => conOC.has(pid));
        if (conflicto.length) return { ok: false, error: conflicto.map((pid) => datos.productos.find((p) => p.id === pid)?.descripcion || pid).join(', ') + ' tiene una orden de compra emitida con este proveedor. Selecciónala o recibe desde Órdenes de compra.' };
      }
    }
    const documentoNumero = MAYUS(d.documentoNumero);
    const lineas: LineaMov[] = d.lineas.map((l) => ({ id: uid(), productoId: String(l.productoId || ''), cantidad: n(l.cantidad), costoUnitario: d.tipo === 'ENTRADA' ? n(l.costoUnitario) : 0, lote: MAYUS(l.lote), fechaVencimiento: String(l.fechaVencimiento || '') }));
    const base = {
      tipo: d.tipo, fecha: d.fecha, motivo: d.motivo,
      bodegaOrigenId: d.tipo === 'ENTRADA' ? null : d.bodegaOrigenId || null, bodegaDestinoId: d.tipo === 'SALIDA' ? null : d.bodegaDestinoId || null,
      tercero: String(d.tercero || '').trim(), documentoTipo: d.documentoTipo, documentoNumero: d.documentoTipo === 'SIN DOCUMENTO' ? '' : documentoNumero,
      documento: d.documentoTipo !== 'SIN DOCUMENTO' ? `${d.documentoTipo} ${documentoNumero}` : '',
      proveedorRut: conProveedor ? d.proveedorRut : '', proveedorNombre: conProveedor ? d.proveedorNombre : '', ordenCompraId: conProveedor && d.ordenCompraId ? d.ordenCompraId : null,
      centroCosto: d.centroCosto || '', observaciones: String(d.observaciones || '').trim(), lineas,
    };
    const claves = Object.keys(base);
    if (editId) {
      const original = datos.movimientos.find((x) => x.id === editId);
      if (!original || original.estado === 'ANULADO') return { ok: false, error: 'El movimiento ya no está disponible para editar.' };
      if (original.recepcionId) return { ok: false, error: 'Esta entrada proviene de una recepción de compra. Edítala desde la orden de compra.' };
      if (original.tomaId) return { ok: false, error: 'Este ajuste proviene de una toma física. No se edita directamente.' };
      if (original.tipo !== d.tipo) return { ok: false, error: 'El tipo de un movimiento no se puede cambiar.' };
      const m = { ...original, ...base } as unknown as Movimiento;
      const otros = movsMotor(datos).filter((x) => x.id !== editId);
      const v = validarMovimiento(m, { productos: productosMotor(datos), bodegas: datos.bodegas, movimientos: otros });
      if (!v.ok) return { ok: false, error: v.errores[0] };
      m.lineas = v.lineas;
      // Al editar una entrada el problema puede aparecer en una salida posterior: se recalcula todo el libro.
      const neg = recalcularInventario([...otros, m], productosMotor(datos)).errores.filter((e) => e.tipo === 'STOCK_NEGATIVO');
      if (neg.length) return { ok: false, error: 'Esta edición dejaría stock negativo: ' + neg.slice(0, 2).map((e) => e.mensaje).join(' · ') };
      await aplicar(empresaId, version, [{ tabla: 'inv_movimientos', accion: 'update', fila: { id: editId, ...aSnake({ ...base, lineas: v.lineas }, claves), editado: ahora(), editado_por: usuario } }]);
      return { ok: true, mensaje: `${original.folio} actualizado.` };
    }
    const m = { id: uid(), estado: 'VIGENTE', creado: ahora(), ...base } as unknown as Movimiento;
    const v = validarMovimiento(m, { productos: productosMotor(datos), bodegas: datos.bodegas, movimientos: movsMotor(datos) });
    if (!v.ok) return { ok: false, error: v.errores[0] };
    const r = await aplicar(empresaId, version, [{ tabla: 'inv_movimientos', accion: 'insert', folio: FOLIO_PREFIJO[d.tipo], ref: 'm', fila: { id: m.id, ...aSnake({ ...base, lineas: v.lineas }, claves), estado: 'VIGENTE', creado: m.creado, creado_por: usuario } }]);
    return { ok: true, mensaje: `Movimiento ${r.folios.m} registrado.`, id: m.id };
  });
}

export async function anularMovimiento(empresaId: string, version: number, id: string, motivo: string): Promise<Res> {
  return correr(async () => {
    const { usuario, datos } = await contexto(empresaId);
    const m = datos.movimientos.find((x) => x.id === id);
    if (!m || m.estado === 'ANULADO') return { ok: false, error: 'El movimiento ya fue anulado o no existe.' };
    if (m.recepcionId) return { ok: false, error: 'Esta entrada proviene de una recepción. Anúlala desde la orden de compra para conservar la trazabilidad.' };
    if (!String(motivo || '').trim()) return { ok: false, error: 'Debes indicar el motivo.' };
    // Mejora respecto del sistema actual: no se permite una anulación que deje stock negativo después.
    const neg = recalcularInventario(movsMotor(datos).filter((x) => x.id !== id), productosMotor(datos)).errores.filter((e) => e.tipo === 'STOCK_NEGATIVO');
    const negAntes = recalcularInventario(movsMotor(datos), productosMotor(datos)).errores.filter((e) => e.tipo === 'STOCK_NEGATIVO');
    if (neg.length > negAntes.length) return { ok: false, error: 'No se puede anular: movimientos posteriores quedarían con stock negativo (' + neg[0].mensaje + ').' };
    await aplicar(empresaId, version, [{ tabla: 'inv_movimientos', accion: 'update', fila: { id, estado: 'ANULADO', motivo_anulacion: motivo.trim(), anulado: ahora(), anulado_por: usuario } }]);
    return { ok: true, mensaje: 'Movimiento anulado; stock reconstruido.' };
  });
}

// ── Tomas físicas ──
export async function crearToma(empresaId: string, version: number, f: { bodegaId: string; alcance: string; grupoId: string; observaciones: string }): Promise<Res> {
  return correr(async () => {
    const { usuario, datos } = await contexto(empresaId);
    if (!datos.bodegas.some((b) => b.id === f.bodegaId && b.activo !== false)) return { ok: false, error: 'Selecciona una bodega activa.' };
    if (datos.tomas.some((t) => t.bodegaId === f.bodegaId && ['EN_PROCESO', 'DEVUELTA', 'PENDIENTE_AUTORIZACION'].includes(t.estado))) return { ok: false, error: 'Ya existe una toma abierta o pendiente para esa bodega.' };
    const calc = recalcularInventario(movsMotor(datos), productosMotor(datos));
    const lineas: LineaToma[] = [];
    const nombre = (pid: string) => { const p = datos.productos.find((x) => x.id === pid); return p ? `${p.codigo} · ${p.descripcion}` : pid; };
    for (const p of datos.productos.filter((p) => p.activo !== false && p.inventariable !== false && (!f.grupoId || p.grupoId === f.grupoId))) {
      const st = calc.stock.find((x) => x.productoId === p.id && x.bodegaId === f.bodegaId), cant = n(st?.cantidad);
      if (p.manejaLotes) {
        for (const l of calc.lotes.filter((x) => x.productoId === p.id && x.bodegaId === f.bodegaId && x.cantidad !== 0))
          lineas.push({ id: uid(), productoId: p.id, lote: l.lote, fechaVencimiento: l.fechaVencimiento || '', teoricoBase: n(l.cantidad), costoBase: n(st?.costoPromedio), fisico: null, contado: false });
      } else if (f.alcance === 'TODOS' || cant !== 0) {
        lineas.push({ id: uid(), productoId: p.id, lote: '', fechaVencimiento: '', teoricoBase: cant, costoBase: n(st?.costoPromedio), fisico: null, contado: false });
      }
    }
    lineas.sort((a, b) => nombre(a.productoId).localeCompare(nombre(b.productoId)) || a.lote.localeCompare(b.lote));
    const id = uid();
    const r = await aplicar(empresaId, version, [{ tabla: 'inv_tomas', accion: 'insert', folio: 'TOMA', ref: 't', fila: { id, bodega_id: f.bodegaId, alcance: f.alcance === 'TODOS' ? 'TODOS' : 'CON_STOCK', grupo_id: f.grupoId || null, observaciones: String(f.observaciones || '').trim(), estado: 'EN_PROCESO', lineas, creado_por: usuario } }]);
    return { ok: true, mensaje: `${r.folios.t} iniciada con ${lineas.length} línea(s).`, id };
  });
}

export async function contarToma(empresaId: string, tomaId: string, lineaId: string, fisico: number | null, costo: number | null): Promise<Res> {
  return correr(async () => {
    const empresa = await requerirEmpresa(empresaId);
    if (!puedeEscribir(empresa.rol)) return { ok: false, error: 'No tienes permiso para modificar el inventario.' };
    const usuario = await requerirUsuario();
    const supabase = await crearClienteServidor();
    const { error } = await supabase.rpc('inv_contar', { p_empresa: empresaId, p_toma: tomaId, p_linea: lineaId, p_fisico: fisico, p_costo: costo, p_usuario: usuario.email });
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/e/${empresaId}/inventario`);
    return { ok: true, mensaje: 'Conteo guardado.' };
  });
}

export async function agregarLineaToma(empresaId: string, tomaId: string, f: { productoId: string; lote: string; fechaVencimiento: string; fisico: number | null; costo: number }): Promise<Res> {
  return correr(async () => {
    const { usuario, datos } = await contexto(empresaId);
    const t = datos.tomas.find((x) => x.id === tomaId);
    if (!t || !['EN_PROCESO', 'DEVUELTA'].includes(t.estado)) return { ok: false, error: 'La toma ya no está editable.' };
    const p = datos.productos.find((x) => x.id === f.productoId);
    if (!p) return { ok: false, error: 'Selecciona un producto.' };
    if (f.fisico == null) return { ok: false, error: 'Ingresa la cantidad física, incluso si es cero.' };
    if (f.fisico < 0) return { ok: false, error: 'La cantidad física no puede ser negativa.' };
    const lote = MAYUS(f.lote);
    if (p.manejaLotes && (!lote || !esFecha(f.fechaVencimiento))) return { ok: false, error: 'Indica lote y vencimiento.' };
    if (t.lineas.some((y) => y.productoId === p.id && String(y.lote || '') === (p.manejaLotes ? lote : ''))) return { ok: false, error: 'Ese producto/lote ya está en la toma.' };
    const calc = recalcularInventario(movsMotor(datos), productosMotor(datos));
    const st = calc.stock.find((x) => x.productoId === p.id && x.bodegaId === t.bodegaId);
    const lt = p.manejaLotes ? calc.lotes.find((x) => x.productoId === p.id && x.bodegaId === t.bodegaId && x.lote === lote) : null;
    const linea: LineaToma = { id: uid(), productoId: p.id, lote: p.manejaLotes ? lote : '', fechaVencimiento: p.manejaLotes ? f.fechaVencimiento : '', teoricoBase: p.manejaLotes ? n(lt?.cantidad) : n(st?.cantidad),
      costoBase: n(st?.costoPromedio), costoConteo: n(f.costo), fisico: f.fisico, contado: true, fisicoFecha: ahora(), contadoPor: usuario, agregadaManual: true };
    await aplicar(empresaId, null, [{ tabla: 'inv_tomas', accion: 'update', version: t.version, fila: { id: t.id, lineas: [...t.lineas, linea], modificado: ahora() } }]);
    return { ok: true, mensaje: 'Línea agregada.' };
  });
}

export async function cambiarEstadoToma(empresaId: string, tomaId: string, accion: 'cerrar' | 'devolver' | 'rechazar', motivo = ''): Promise<Res> {
  return correr(async () => {
    const { usuario, datos } = await contexto(empresaId);
    const t = datos.tomas.find((x) => x.id === tomaId);
    if (!t) return { ok: false, error: 'La toma ya no existe.' };
    let fila: Record<string, unknown>;
    if (accion === 'cerrar') {
      if (!['EN_PROCESO', 'DEVUELTA'].includes(t.estado)) return { ok: false, error: 'La toma ya no está editable.' };
      if (!t.lineas.length) return { ok: false, error: 'La toma no tiene líneas. Agrega al menos un producto o lote.' };
      const pend = t.lineas.filter((l) => !l.contado).length;
      if (pend) return { ok: false, error: `Faltan ${pend} línea(s) por contar. Ingresa cero cuando corresponda.` };
      fila = { estado: 'PENDIENTE_AUTORIZACION', cerrado: ahora(), cerrado_por: usuario, motivo: '' };
    } else {
      if (t.estado !== 'PENDIENTE_AUTORIZACION') return { ok: false, error: 'La toma ya no está pendiente de autorización.' };
      if (!motivo.trim()) return { ok: false, error: 'Indica el motivo.' };
      fila = accion === 'devolver' ? { estado: 'DEVUELTA', motivo: motivo.trim() } : { estado: 'RECHAZADA', motivo: motivo.trim(), resuelto: ahora(), resuelto_por: usuario };
    }
    await aplicar(empresaId, null, [{ tabla: 'inv_tomas', accion: 'update', version: t.version, fila: { id: t.id, ...fila, modificado: ahora() } }]);
    return { ok: true, mensaje: accion === 'cerrar' ? 'Toma cerrada y pendiente de autorización.' : accion === 'devolver' ? 'Toma devuelta para corrección.' : 'Toma rechazada.' };
  });
}

export async function autorizarToma(empresaId: string, version: number, tomaId: string): Promise<Res> {
  return correr(async () => {
    const { usuario, datos } = await contexto(empresaId);
    const t = datos.tomas.find((x) => x.id === tomaId);
    if (!t || t.estado !== 'PENDIENTE_AUTORIZACION') return { ok: false, error: 'La toma ya no está pendiente.' };
    const movs = movsMotor(datos), calc = recalcularInventario(movs, productosMotor(datos));
    const entradas: LineaMov[] = [], salidas: LineaMov[] = [];
    for (const l of t.lineas) {
      const r = rebasarLineaToma(l, t as never, movs, calc), p = datos.productos.find((x) => x.id === l.productoId);
      if (r.objetivo < 0) return { ok: false, error: `${p?.descripcion}: el objetivo rebasado queda negativo; revisa movimientos posteriores al conteo.` };
      if (Math.abs(r.diferencia) < 1e-6) continue;
      const base = { id: uid(), productoId: l.productoId, cantidad: Math.abs(r.diferencia), lote: l.lote || '', fechaVencimiento: l.fechaVencimiento || '' };
      if (r.diferencia > 0) {
        const st = calc.stock.find((x) => x.productoId === l.productoId && x.bodegaId === t.bodegaId), costo = n(st?.costoPromedio) || n(l.costoBase) || n(l.costoConteo);
        if (costo <= 0) return { ok: false, error: `${p?.descripcion}: indica un costo para valorizar el sobrante.` };
        entradas.push({ ...base, costoUnitario: costo });
      } else salidas.push(base);
    }
    const t0 = ahora();
    const nuevos: Op[] = [], nuevosMotor: Movimiento[] = [];
    if (entradas.length) {
      const id = uid(); const f = { id, tipo: 'AJUSTE_ENTRADA', motivo: 'AJUSTE POR TOMA', fecha: hoy(), bodega_destino_id: t.bodegaId, documento: t.folio, observaciones: `Sobrantes autorizados de ${t.folio}`, lineas: entradas, estado: 'VIGENTE', toma_id: t.id, creado: t0, creado_por: usuario };
      nuevos.push({ tabla: 'inv_movimientos', accion: 'insert', folio: 'AJE', ref: 'aje', fila: f });
      nuevosMotor.push({ id, tipo: 'AJUSTE_ENTRADA', fecha: f.fecha, creado: t0, bodegaDestinoId: t.bodegaId, lineas: entradas, tomaId: t.id });
    }
    if (salidas.length) {
      const id = uid(); const f = { id, tipo: 'AJUSTE_SALIDA', motivo: 'AJUSTE POR TOMA', fecha: hoy(), bodega_origen_id: t.bodegaId, documento: t.folio, observaciones: `Faltantes autorizados de ${t.folio}`, lineas: salidas, estado: 'VIGENTE', toma_id: t.id, creado: t0, creado_por: usuario };
      nuevos.push({ tabla: 'inv_movimientos', accion: 'insert', folio: 'AJS', ref: 'ajs', fila: f });
      nuevosMotor.push({ id, tipo: 'AJUSTE_SALIDA', fecha: f.fecha, creado: t0, bodegaOrigenId: t.bodegaId, lineas: salidas, tomaId: t.id });
    }
    for (const m of nuevosMotor) {
      const v = validarMovimiento(m, { productos: productosMotor(datos), bodegas: datos.bodegas, movimientos: [...movs, ...nuevosMotor.filter((x) => x !== m)] });
      if (!v.ok) return { ok: false, error: v.errores[0] };
    }
    const ajustes = [...(entradas.length ? ['{{aje}}'] : []), ...(salidas.length ? ['{{ajs}}'] : [])];
    const r = await aplicar(empresaId, version, [...nuevos, { tabla: 'inv_tomas', accion: 'update', version: t.version, fila: { id: t.id, estado: 'APLICADA', resuelto: t0, resuelto_por: usuario, movimientos_ajuste: ajustes, modificado: t0 } }]);
    return { ok: true, mensaje: `Toma aplicada · ${nuevos.length} movimiento(s) de ajuste${Object.values(r.folios).length ? ': ' + Object.values(r.folios).join(', ') : ''}.` };
  });
}

// ── Órdenes de compra ──
export interface BorradorOC {
  id: string | null; version: number; fecha: string; fechaEntrega: string; proveedorRut: string; proveedorNombre: string; bodegaId: string; centroCosto: string;
  condicionPago: string; observaciones: string; lineas: { id: string; productoId: string; cantidad: number | string; precioUnitario: number | string; descuentoPct: number | string }[];
}
export async function guardarOC(empresaId: string, d: BorradorOC, emitir: boolean): Promise<Res> {
  return correr(async () => {
    const [{ usuario, datos }, apoyo] = await Promise.all([contexto(empresaId), apoyoInventario(empresaId)]);
    const prov = apoyo.proveedores.find((p) => p.rut === d.proveedorRut);
    const lineas: LineaOC[] = d.lineas.map((l) => ({ id: l.id || uid(), productoId: String(l.productoId || ''), cantidad: n(l.cantidad), precioUnitario: n(l.precioUnitario), descuentoPct: n(l.descuentoPct), aplicaIVA: datos.productos.find((p) => p.id === l.productoId)?.aplicaIVA !== false }));
    const cand = { id: d.id || uid(), fecha: d.fecha, fechaEntrega: d.fechaEntrega || undefined, proveedorRut: d.proveedorRut, proveedorNombre: prov?.nombre || d.proveedorNombre, bodegaId: d.bodegaId, lineas };
    const v = validarOrdenCompra(cand, { productos: productosMotor(datos), bodegas: datos.bodegas, proveedores: apoyo.proveedores });
    if (!v.ok) return { ok: false, error: v.errores[0] };
    if (!esFecha(d.fecha) || (d.fechaEntrega && !esFecha(d.fechaEntrega))) return { ok: false, error: 'Revisa las fechas.' };
    const fila = { fecha: d.fecha, fecha_entrega: d.fechaEntrega || null, proveedor_rut: d.proveedorRut, proveedor_nombre: cand.proveedorNombre, bodega_id: d.bodegaId, centro_costo: d.centroCosto || '',
      condicion_pago: String(d.condicionPago || '').trim(), observaciones: String(d.observaciones || '').trim(), lineas: v.lineas, estado: emitir ? 'EMITIDA' : 'BORRADOR' };
    if (d.id) {
      const o = datos.ordenes.find((x) => x.id === d.id);
      if (!o) return { ok: false, error: 'La orden ya no existe.' };
      if (o.estado !== 'BORRADOR') return { ok: false, error: 'Sólo se puede editar una orden en borrador.' };
      await aplicar(empresaId, null, [{ tabla: 'inv_ordenes_compra', accion: 'update', version: d.version, fila: { id: d.id, ...fila, modificado: ahora(), modificado_por: usuario } }]);
      return { ok: true, mensaje: `${o.folio} ${emitir ? 'emitida' : 'guardada como borrador'}.`, id: d.id };
    }
    const r = await aplicar(empresaId, null, [{ tabla: 'inv_ordenes_compra', accion: 'insert', folio: 'OC', ref: 'oc', fila: { id: cand.id, ...fila, creado_por: usuario } }]);
    return { ok: true, mensaje: `${r.folios.oc} ${emitir ? 'emitida' : 'guardada como borrador'}.`, id: cand.id };
  });
}

export async function cambiarEstadoOC(empresaId: string, ocId: string, accion: 'emitir' | 'anular' | 'cerrar', motivo = ''): Promise<Res> {
  return correr(async () => {
    const [{ usuario, datos }, apoyo] = await Promise.all([contexto(empresaId), apoyoInventario(empresaId)]);
    const o = datos.ordenes.find((x) => x.id === ocId);
    if (!o) return { ok: false, error: 'La orden ya no existe.' };
    let fila: Record<string, unknown>;
    if (accion === 'emitir') {
      if (o.estado !== 'BORRADOR') return { ok: false, error: 'La orden ya fue emitida.' };
      const v = validarOrdenCompra(o as never, { productos: productosMotor(datos), bodegas: datos.bodegas, proveedores: apoyo.proveedores });
      if (!v.ok) return { ok: false, error: v.errores[0] };
      fila = { estado: 'EMITIDA' };
    } else if (accion === 'anular') {
      if (!['BORRADOR', 'EMITIDA'].includes(o.estado)) return { ok: false, error: 'Sólo se anula una orden en borrador o emitida sin recepciones.' };
      if (datos.recepciones.some((r) => r.ordenCompraId === o.id && r.estado !== 'ANULADA')) return { ok: false, error: 'No se puede anular una OC con recepciones vigentes.' };
      if (!motivo.trim()) return { ok: false, error: 'Indica el motivo.' };
      fila = { estado: 'ANULADA', motivo_anulacion: motivo.trim() };
    } else {
      if (o.estado !== 'PARCIAL') return { ok: false, error: 'Sólo se cierra el saldo de una orden con recepción parcial.' };
      fila = { estado: 'CERRADA_PARCIAL' };
    }
    await aplicar(empresaId, null, [{ tabla: 'inv_ordenes_compra', accion: 'update', version: o.version, fila: { id: o.id, ...fila, modificado: ahora(), modificado_por: usuario } }]);
    return { ok: true, mensaje: accion === 'emitir' ? 'Orden emitida.' : accion === 'anular' ? 'Orden anulada.' : 'Saldo pendiente cerrado.' };
  });
}

export interface BorradorRecepcion { ordenCompraId: string; ordenVersion: number; fecha: string; documentoTipo: string; documentoNumero: string; observaciones: string; lineas: { ocLineaId: string; cantidad: number | string; lote?: string; fechaVencimiento?: string }[] }
export async function registrarRecepcion(empresaId: string, version: number, d: BorradorRecepcion): Promise<Res> {
  return correr(async () => {
    const [{ usuario, datos }, apoyo] = await Promise.all([contexto(empresaId), apoyoInventario(empresaId)]);
    const o = datos.ordenes.find((x) => x.id === d.ordenCompraId);
    if (!o) return { ok: false, error: 'La orden ya no existe.' };
    if (o.version !== d.ordenVersion) return { ok: false, error: 'La orden cambió en otro equipo. Reabre la recepción.' };
    if (!['EMITIDA', 'PARCIAL'].includes(o.estado)) return { ok: false, error: 'La orden ya no admite recepciones.' };
    if (!(d.documentoTipo in TIPOS_DOC_RECEPCION)) return { ok: false, error: 'Tipo de documento inválido.' };
    if (!esFecha(d.fecha)) return { ok: false, error: 'Indica la fecha de recepción.' };
    if (d.fecha < o.fecha) return { ok: false, error: 'La recepción no puede ser anterior a la orden.' };
    const numero = MAYUS(d.documentoNumero);
    if (datos.recepciones.some((r) => r.estado !== 'ANULADA' && r.proveedorRut === o.proveedorRut && r.documentoTipo === d.documentoTipo && MAYUS(r.documentoNumero) === numero)) return { ok: false, error: 'Ese documento ya fue recibido para el proveedor.' };
    const valida = validarRecepcion({ ...d, documentoNumero: numero, lineas: d.lineas.map((l) => ({ ...l, cantidad: n(l.cantidad) })) }, o as never, { productos: productosMotor(datos), recepciones: datos.recepciones as never });
    if (!valida.ok) return { ok: false, error: valida.errores[0] };
    const prodDe = (ocLineaId: string) => { const ol = o.lineas.find((x) => x.id === ocLineaId)!; return { ol, p: datos.productos.find((x) => x.id === ol.productoId) }; };
    if (d.documentoTipo === 'FACTURA EXENTA' && valida.lineas.some((l) => prodDe(l.ocLineaId).p?.aplicaIVA !== false)) return { ok: false, error: 'Una factura exenta contiene productos configurados como afectos a IVA.' };
    const tipoDTE = TIPOS_DOC_RECEPCION[d.documentoTipo];
    const recId = uid(), movId = uid(), t0 = ahora();
    const lineasRec = valida.lineas.map((l) => { const { ol } = prodDe(l.ocLineaId); return { id: uid(), ocLineaId: l.ocLineaId, productoId: ol.productoId, cantidad: n(l.cantidad), lote: MAYUS(l.lote), fechaVencimiento: l.fechaVencimiento || '', precioUnitario: r6(n(ol.precioUnitario) * (1 - n(ol.descuentoPct) / 100)) }; });
    const compra = tipoDTE === 33 || tipoDTE === 34 ? buscarCompraParaRecepcion({ tipoDTE, proveedorRut: o.proveedorRut, documentoNumero: numero }, apoyo.facturas) : null;
    const lineasMov: LineaMov[] = lineasRec.map((l) => ({ id: uid(), productoId: l.productoId, cantidad: l.cantidad, costoUnitario: l.precioUnitario, lote: l.lote, fechaVencimiento: l.fechaVencimiento }));
    const mov: Movimiento = { id: movId, tipo: 'ENTRADA', fecha: d.fecha, creado: t0, bodegaDestinoId: o.bodegaId, lineas: lineasMov };
    const vm = validarMovimiento(mov, { productos: productosMotor(datos), bodegas: datos.bodegas, movimientos: movsMotor(datos) });
    if (!vm.ok) return { ok: false, error: vm.errores[0] };
    const recsDespues = [...datos.recepciones, { ordenCompraId: o.id, estado: 'VIGENTE', lineas: lineasRec }] as never[];
    const nuevoEstado = estadoSegunRecepciones(o as never, recsDespues);
    const r = await aplicar(empresaId, version, [
      { tabla: 'inv_recepciones', accion: 'insert', folio: 'REC', ref: 'rec', fila: { id: recId, orden_compra_id: o.id, proveedor_rut: o.proveedorRut, proveedor_nombre: o.proveedorNombre, bodega_id: o.bodegaId, fecha: d.fecha, documento_tipo: d.documentoTipo, tipo_dte: tipoDTE, documento_numero: numero,
        estado_contable: compra ? 'CONCILIADA' : tipoDTE === 33 || tipoDTE === 34 ? 'PENDIENTE_CONCILIACION' : 'ESPERA_FACTURA', compra_id: compra?.id || null, observaciones: String(d.observaciones || '').trim(), lineas: lineasRec, estado: 'VIGENTE', creado: t0, creado_por: usuario } },
      { tabla: 'inv_movimientos', accion: 'insert', folio: 'ENT', ref: 'ent', fila: { id: movId, tipo: 'ENTRADA', motivo: 'COMPRA', fecha: d.fecha, bodega_destino_id: o.bodegaId, documento: `${d.documentoTipo} ${numero}`, documento_tipo: 'SIN DOCUMENTO', tercero: o.proveedorNombre,
        centro_costo: o.centroCosto || '', observaciones: `Recepción {{rec}} de ${o.folio}`, lineas: vm.lineas, estado: 'VIGENTE', recepcion_id: recId, orden_compra_id: o.id, creado: t0, creado_por: usuario } },
      { tabla: 'inv_ordenes_compra', accion: 'update', version: o.version, fila: { id: o.id, estado: nuevoEstado, modificado: t0, modificado_por: usuario } },
    ]);
    const otras = otrasRecepcionesMismoDocumento<{ id?: string; estado?: string; proveedorRut: string; documentoNumero: string; folio?: string }>({ id: recId, estado: 'VIGENTE', proveedorRut: o.proveedorRut, documentoNumero: numero }, datos.recepciones);
    const aviso = otras.length ? ` ⚠️ Ya existe otra recepción con el mismo N° de documento para este proveedor (${otras.map((x) => x.folio).join(', ')}). Verifica que no sea un duplicado.` : '';
    return { ok: true, mensaje: `${r.folios.rec} registrada · entrada ${r.folios.ent}${compra ? ' · 🔗 conciliada con la factura ya registrada' : ''}.${aviso}` };
  });
}

export async function anularRecepcion(empresaId: string, version: number, recId: string, motivo: string): Promise<Res> {
  return correr(async () => {
    const { usuario, datos } = await contexto(empresaId);
    const r = datos.recepciones.find((x) => x.id === recId);
    if (!r || r.estado === 'ANULADA') return { ok: false, error: 'La recepción ya fue anulada o no existe.' };
    if (!String(motivo || '').trim()) return { ok: false, error: 'Indica el motivo.' };
    const m = datos.movimientos.find((x) => x.recepcionId === r.id && x.estado !== 'ANULADO');
    if (!m) return { ok: false, error: 'No se encontró la entrada de inventario asociada.' };
    const salida = { id: 'x', tipo: 'AJUSTE_SALIDA', fecha: hoy(), bodegaOrigenId: r.bodegaId, lineas: m.lineas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad, lote: l.lote })) } as Movimiento;
    const vs = validarMovimiento(salida, { productos: productosMotor(datos), bodegas: datos.bodegas, movimientos: movsMotor(datos) });
    if (!vs.ok) return { ok: false, error: 'No se puede anular: parte de la mercadería ya no está disponible. ' + vs.errores[0] };
    const o = datos.ordenes.find((x) => x.id === r.ordenCompraId);
    const t0 = ahora();
    const ops: Op[] = [
      { tabla: 'inv_recepciones', accion: 'update', fila: { id: r.id, estado: 'ANULADA', motivo_anulacion: motivo.trim(), modificado: t0, modificado_por: usuario } },
      { tabla: 'inv_movimientos', accion: 'update', fila: { id: m.id, estado: 'ANULADO', motivo_anulacion: `Recepción anulada: ${motivo.trim()}`, anulado: t0, anulado_por: usuario } },
    ];
    if (o) {
      const recs = datos.recepciones.map((x) => (x.id === r.id ? { ...x, estado: 'ANULADA' } : x)) as never[];
      const baseEstado = o.estado === 'CERRADA_PARCIAL' ? 'CERRADA_PARCIAL' : 'EMITIDA';
      ops.push({ tabla: 'inv_ordenes_compra', accion: 'update', version: o.version, fila: { id: o.id, estado: estadoSegunRecepciones({ ...o, estado: baseEstado } as never, recs), modificado: t0, modificado_por: usuario } });
    }
    await aplicar(empresaId, version, ops);
    return { ok: true, mensaje: 'Recepción y entrada anuladas.' };
  });
}

export async function vincularFactura(empresaId: string, recId: string, compraId: string): Promise<Res> {
  return correr(async () => {
    const [{ usuario, datos }, apoyo] = await Promise.all([contexto(empresaId), apoyoInventario(empresaId)]);
    const r = datos.recepciones.find((x) => x.id === recId);
    if (!r || r.estado === 'ANULADA') return { ok: false, error: 'La recepción ya no está disponible.' };
    if (r.compraId) return { ok: false, error: 'Esta recepción ya está conciliada con una factura.' };
    const c = apoyo.facturas.find((x) => x.id === compraId);
    if (!c || c.estado === 'anulado' || c.rut !== r.proveedorRut) return { ok: false, error: 'La factura seleccionada ya no está disponible.' };
    await aplicar(empresaId, null, [{ tabla: 'inv_recepciones', accion: 'update', fila: { id: r.id, compra_id: c.id, estado_contable: 'CONCILIADA', conciliado_manual: true, modificado: ahora(), modificado_por: usuario } }]);
    return { ok: true, mensaje: `${r.folio} conciliada con DTE ${c.tipoDTE} N°${c.folio}.` };
  });
}

