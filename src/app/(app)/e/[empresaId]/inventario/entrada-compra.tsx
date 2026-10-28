'use client';

import { useState } from 'react';
import { cuadraturaCompra, unitarioParaCuadrar, compraDeMovimiento, docTipoCompra, type CompraEntrada, type LineaEntradaCompra, type Movimiento } from '@/inventario/motor';
import { decimalCL, decimalInput } from '@/lib/formato';
import { Modal } from '@/components/modal';
import { Mensaje } from '@/components/form-estado';
import { entradaDesdeCompra } from './acciones';
import { FormProductoModal, productoNuevo } from './productos';
import { OpcionesBodega, OpcionesProducto, bodegasActivas, fechaCorta, mon, nombreProducto, type Ctx } from './comun';

// Entrada de inventario desde una factura de compra ya contabilizada: trae los
// datos del documento, se agregan los productos línea a línea y sólo se guarda
// cuando la suma de los netos cuadra con el neto total del documento.

type Linea = { k: string; productoId: string; cantidad: string; precioUnitario: string; descuentoPct: string; lote: string; fechaVencimiento: string };
const lineaVacia = (): Linea => ({ k: crypto.randomUUID(), productoId: '', cantidad: '', precioUnitario: '', descuentoPct: '', lote: '', fechaVencimiento: '' });
const aMotor = (l: Linea): LineaEntradaCompra => ({ productoId: l.productoId, cantidad: decimalCL(l.cantidad), precioUnitario: decimalCL(l.precioUnitario), descuentoPct: decimalCL(l.descuentoPct), lote: l.lote, fechaVencimiento: l.fechaVencimiento });

/** Documentos de compra que todavía no entraron al inventario. */
export function comprasDisponibles(c: Ctx) {
  const cargadas = new Set(c.datos.movimientos.filter((m) => m.estado !== 'ANULADO').map((m) => compraDeMovimiento(m as unknown as Movimiento)).filter(Boolean));
  for (const r of c.datos.recepciones) if (r.estado !== 'ANULADA' && r.compraId) cargadas.add(r.compraId);
  return c.apoyo.compras.filter((x) => !cargadas.has(x.id));
}

export function EntradaCompra({ c, onCerrar }: { c: Ctx; onCerrar: () => void }) {
  const [q, setQ] = useState('');
  const [doc, setDoc] = useState<CompraEntrada | null>(null);
  const [fecha, setFecha] = useState('');
  const [bodega, setBodega] = useState(bodegasActivas(c)[0]?.id || '');
  const [cc, setCc] = useState('');
  const [obs, setObs] = useState('');
  const [lineas, setLineas] = useState<Linea[]>([lineaVacia()]);
  const [nuevoProd, setNuevoProd] = useState<number | null>(null);

  if (!doc) {
    const t = q.toLowerCase().trim();
    const lista = comprasDisponibles(c).filter((x) => !t || `${x.folio} ${x.razonSocial} ${x.rut}`.toLowerCase().includes(t));
    return (
      <Modal titulo="Entrada desde documento de compra" sub="Elige una factura ya contabilizada. Sólo aparecen las que aún no se cargaron al inventario." onCerrar={onCerrar} ancho="max-w-4xl">
        <input className="campo" value={q} onChange={(e) => setQ(e.target.value)} placeholder="N° de documento, proveedor o RUT…" aria-label="Buscar documento" autoFocus />
        <div className="max-h-[55vh] overflow-auto"><table className="w-full text-xs">
          <thead className="sticky top-0 bg-panel text-left text-tenue"><tr className="border-b border-borde"><th className="py-1">Fecha</th><th>Documento</th><th>Proveedor</th><th className="text-right">Neto + exento</th><th className="text-right">IVA</th><th className="text-right">Total</th><th /></tr></thead>
          <tbody>{lista.length ? lista.slice(0, 100).map((x) => (
            <tr key={x.id} className="cursor-pointer border-b border-borde/30 hover:bg-panel-2" onClick={() => { setDoc(x); setFecha(x.fecha || c.hoy); }}>
              <td className="py-1.5">{fechaCorta(x.fecha)}</td><td className="num">{x.tipoDTE} · N° {x.folio}</td>
              <td>{x.razonSocial}<div className="text-[10px] text-tenue">{x.rut}</div></td>
              <td className="num text-right">{mon(x.neto + x.exento)}</td><td className="num text-right">{mon(x.iva)}</td><td className="num text-right font-semibold">{mon(x.total)}</td>
              <td className="text-right"><span className="boton !px-2 !py-0.5 text-xs">Elegir</span></td>
            </tr>
          )) : <tr><td colSpan={7} className="py-6 text-center text-tenue">{t ? 'Ningún documento coincide con la búsqueda.' : 'No hay facturas contabilizadas pendientes de cargar al inventario.'}</td></tr>}</tbody>
        </table></div>
        {lista.length > 100 && <p className="text-xs text-tenue">Se muestran 100 de {lista.length}. Afina la búsqueda.</p>}
      </Modal>
    );
  }

  const motor = lineas.map(aMotor);
  const afecto = (pid: string) => c.datos.productos.find((p) => p.id === pid)?.aplicaIVA !== false;
  const cu = cuadraturaCompra(doc, motor, afecto);
  const setL = (i: number, x: Partial<Linea>) => setLineas(lineas.map((l, j) => (j === i ? { ...l, ...x } : l)));
  const ultima = [...lineas.keys()].reverse().find((k) => decimalCL(lineas[k].cantidad) > 0);
  const cuadrar = () => {
    if (ultima == null) return;
    const u = unitarioParaCuadrar(doc, motor, ultima);
    if (u == null) { c.avisar({ error: 'Las demás líneas ya suman el neto del documento o más.' }); return; }
    setL(ultima, { precioUnitario: decimalInput(u) });
  };
  const guardar = async () => {
    if (await c.run(() => entradaDesdeCompra(c.empresaId, c.datos.version, { compraId: doc.id, fecha, bodegaDestinoId: bodega, centroCosto: cc, observaciones: obs, lineas: motor }))) onCerrar();
  };
  const conOC = new Set(c.datos.ordenes.filter((o) => ['EMITIDA', 'PARCIAL'].includes(o.estado) && o.proveedorRut === doc.rut).flatMap((o) => o.lineas.map((l) => String(l.productoId))));
  const conflicto = lineas.filter((l) => conOC.has(l.productoId));

  return (
    <Modal titulo={`Entrada desde ${docTipoCompra(doc.tipoDTE).toLowerCase()} N° ${doc.folio}`} sub="Agrega los productos línea por línea. Para guardar, el neto de las líneas debe cuadrar con el neto del documento." onCerrar={onCerrar} ancho="max-w-5xl">
      <div className="grid gap-2 text-xs sm:grid-cols-3">
        <div className="rounded-md border border-borde p-2"><div className="text-[10px] text-tenue uppercase">Proveedor</div><div className="font-medium">{doc.razonSocial}</div><div className="text-tenue">{doc.rut}</div></div>
        <div className="rounded-md border border-borde p-2"><div className="text-[10px] text-tenue uppercase">Documento</div><div className="font-medium">DTE {doc.tipoDTE} · N° {doc.folio}</div><div className="text-tenue">Emitido el {fechaCorta(doc.fecha)}</div></div>
        <div className="rounded-md border border-borde p-2"><div className="text-[10px] text-tenue uppercase">Montos del documento</div><div className="font-medium">Neto {mon(doc.neto)}{doc.exento ? ` · Exento ${mon(doc.exento)}` : ''}</div><div className="text-tenue">IVA {mon(doc.iva)} · Total {mon(doc.total)}</div></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <div><label className="etiqueta" htmlFor="ec-fecha">Fecha de ingreso</label><input id="ec-fecha" type="date" className="campo" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
        <div><label className="etiqueta" htmlFor="ec-bod">Bodega destino</label><select id="ec-bod" className="campo" value={bodega} onChange={(e) => setBodega(e.target.value)}><OpcionesBodega c={c} /></select></div>
        <div><label className="etiqueta" htmlFor="ec-cc">Centro de costo</label><select id="ec-cc" className="campo" value={cc} onChange={(e) => setCc(e.target.value)}><option value="">Sin centro</option>{c.apoyo.centros.map((x) => <option key={x.codigo} value={x.codigo}>{x.codigo} · {x.nombre}</option>)}</select></div>
        <div><label className="etiqueta" htmlFor="ec-obs">Observaciones</label><input id="ec-obs" className="campo" value={obs} onChange={(e) => setObs(e.target.value)} /></div>
      </div>
      <h3 className="pt-1 text-xs font-semibold text-tenue uppercase">Productos</h3>
      {lineas.map((l, i) => {
        const p = c.datos.productos.find((x) => x.id === l.productoId);
        return (
          <div key={l.k} className="grid items-end gap-2 rounded-md border border-borde p-2 sm:grid-cols-[2fr_1fr_1fr_0.8fr_1fr_auto]">
            <div><label className="etiqueta" htmlFor={`ec-p-${i}`}>Producto</label><select id={`ec-p-${i}`} className="campo" value={l.productoId} onChange={(e) => setL(i, { productoId: e.target.value, lote: '', fechaVencimiento: '' })}><OpcionesProducto c={c} /></select>
              {p && <span className="text-[10px] text-tenue">{p.unidad}{p.aplicaIVA === false ? ' · exento' : ''}</span>}</div>
            <div><label className="etiqueta" htmlFor={`ec-c-${i}`}>Cantidad</label><input id={`ec-c-${i}`} className="campo num text-right" inputMode="decimal" value={decimalInput(l.cantidad)} onChange={(e) => setL(i, { cantidad: decimalInput(e.target.value) })} /></div>
            <div><label className="etiqueta" htmlFor={`ec-u-${i}`}>Valor unitario neto</label><input id={`ec-u-${i}`} className="campo num text-right" inputMode="decimal" value={decimalInput(l.precioUnitario)} onChange={(e) => setL(i, { precioUnitario: decimalInput(e.target.value) })} /></div>
            <div><label className="etiqueta" htmlFor={`ec-d-${i}`}>Desc. %</label><input id={`ec-d-${i}`} className="campo num text-right" inputMode="decimal" value={decimalInput(l.descuentoPct)} onChange={(e) => setL(i, { descuentoPct: decimalInput(e.target.value) })} /></div>
            <div className="text-right"><div className="text-[10px] text-tenue uppercase">Neto línea</div><div className="num py-2 font-semibold">{mon(cu.netos[i])}</div></div>
            <button type="button" className="boton-sec" aria-label="Quitar línea" onClick={() => setLineas(lineas.length === 1 ? [lineaVacia()] : lineas.filter((_, j) => j !== i))}>×</button>
            {p?.manejaLotes && <>
              <div><label className="etiqueta" htmlFor={`ec-l-${i}`}>Lote</label><input id={`ec-l-${i}`} className="campo" value={l.lote} onChange={(e) => setL(i, { lote: e.target.value.toUpperCase() })} /></div>
              <div><label className="etiqueta" htmlFor={`ec-v-${i}`}>Vencimiento</label><input id={`ec-v-${i}`} type="date" className="campo" value={l.fechaVencimiento} onChange={(e) => setL(i, { fechaVencimiento: e.target.value })} /></div>
            </>}
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="boton-sec" onClick={() => setLineas([...lineas, lineaVacia()])}>＋ Agregar producto</button>
        <button type="button" className="boton-sec" title="Crea un producto sin salir de la entrada" onClick={() => {
          const i = lineas.findIndex((l) => !l.productoId);
          if (i >= 0) setNuevoProd(i); else { setLineas([...lineas, lineaVacia()]); setNuevoProd(lineas.length); }
        }}>🆕 Crear producto</button>
        {cu.diferencia !== 0 && ultima != null && <button type="button" className="boton-sec" title="Calcula el valor unitario de la última línea para que el total cuadre" onClick={cuadrar}>⚖️ Cuadrar con la última línea</button>}
      </div>
      <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 rounded-md bg-panel-2 px-3 py-2 text-sm">
        <span>Neto líneas <strong className="num">{mon(cu.neto)}</strong></span><span>IVA <strong className="num">{mon(cu.iva)}</strong></span><span>Total <strong className="num">{mon(cu.total)}</strong></span>
      </div>
      <p className={`rounded-md border p-2 text-sm ${cu.cuadra ? 'border-acento/40 bg-acento/10 text-acento' : 'border-peligro/40 bg-peligro/10 text-peligro'}`}>
        {cu.cuadra ? `✅ Cuadrado: las líneas suman ${mon(cu.neto)}, igual al neto del documento.` : <>⚖️ Neto del documento {mon(cu.objetivo)} · líneas {mon(cu.neto)} · <strong>diferencia {mon(cu.diferencia)}</strong>. Debe quedar en $0 para guardar.</>}
        {cu.cuadra && ![32, 34].includes(doc.tipoDTE) && cu.iva !== Math.round(doc.iva) && <span className="text-tenue"> El IVA calculado ({mon(cu.iva)}) difiere del IVA del documento ({mon(doc.iva)}): revisa si algún producto es exento.</span>}
      </p>
      {conflicto.length > 0 && <p className="rounded-md border border-aviso/40 bg-aviso/10 p-2 text-xs text-aviso">{conflicto.map((l) => nombreProducto(c, l.productoId)).join(', ')} tiene una orden de compra abierta con este proveedor. Si la factura corresponde a esa orden, conviene recibirla desde Órdenes de compra.</p>}
      {nuevoProd != null && <FormProductoModal c={c} id={null} inicial={productoNuevo(c)} flotante onCerrar={() => setNuevoProd(null)}
        onCreado={(id) => setLineas((prev) => prev.map((l, j) => (j === nuevoProd ? { ...l, productoId: id, lote: '', fechaVencimiento: '' } : l)))} />}
      {c.msg.error && <Mensaje error={c.msg.error} />}
      <div className="flex justify-end gap-2 border-t border-borde pt-3">
        <button type="button" className="boton-sec" onClick={() => { setDoc(null); setLineas([lineaVacia()]); }}>← Otro documento</button>
        <button type="button" className="boton-sec" onClick={onCerrar}>Cancelar</button>
        <button type="button" className="boton" disabled={c.pendiente || !cu.cuadra || !bodega} title={cu.cuadra ? '' : 'La suma de las líneas debe cuadrar con el neto del documento'} onClick={guardar}>{c.pendiente ? 'Guardando…' : 'Guardar entrada'}</button>
      </div>
    </Modal>
  );
}
