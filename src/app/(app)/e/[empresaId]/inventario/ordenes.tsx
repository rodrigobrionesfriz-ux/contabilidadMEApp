'use client';

import { useState } from 'react';
import type { OrdenCompraI } from '@/inventario/filas';
import { OC_ESTADOS, TIPOS_DOC_RECEPCION, calcularTotalesOC, comprasVinculables, resumenRecepcionOC, totalLineaOC } from '@/inventario/motor';
import { decimalCL } from '@/lib/formato';
import { Modal } from '@/components/modal';
import { Mensaje } from '@/components/form-estado';
import { guardarOC, cambiarEstadoOC, registrarRecepcion, anularRecepcion, vincularFactura, type BorradorOC, type BorradorRecepcion } from './acciones';
import { Badge, Kpi, OpcionesBodega, OpcionesProducto, Vacio, bodegasActivas, fechaCorta, fmt, mon, nombreBodega, nombreProducto, pedirMotivo, productosDisponibles, type Ctx } from './comun';

const tonoOC = (e: string) => (({ BORRADOR: 'tenue', EMITIDA: 'info', PARCIAL: 'aviso', RECIBIDA: 'ok', CERRADA_PARCIAL: 'tenue', ANULADA: 'mal' } as Record<string, 'tenue' | 'info' | 'aviso' | 'ok' | 'mal'>)[e] || 'tenue');
type LineaRec = { k: string; ocLineaId: string; productoId: string; pendiente: number; cantidad: string; lote: string; fechaVencimiento: string };
type BorradorRec = Omit<BorradorRecepcion, 'lineas'> & { lineas: LineaRec[] };
const lineaOC = () => ({ id: crypto.randomUUID(), productoId: '', cantidad: '', precioUnitario: '', descuentoPct: '0' });
const conIva = (c: Ctx, lineas: BorradorOC['lineas']) => lineas.map((l) => ({ ...l, cantidad: decimalCL(l.cantidad), precioUnitario: decimalCL(l.precioUnitario), descuentoPct: decimalCL(l.descuentoPct), aplicaIVA: c.datos.productos.find((p) => p.id === l.productoId)?.aplicaIVA !== false }));

export function Ordenes({ c }: { c: Ctx }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const [b, setB] = useState<BorradorOC | null>(null);
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState('');
  const o = abierta ? c.datos.ordenes.find((x) => x.id === abierta) : null;
  const nueva = () => {
    if (!c.apoyo.proveedores.length) { c.avisar({ error: 'Primero registra al menos una compra del proveedor (Compras y ventas o Importar RCV): la lista de proveedores sale de ahí.' }); return; }
    if (!bodegasActivas(c).length || !productosDisponibles(c).length) { c.avisar({ error: 'Necesitas una bodega y productos activos.' }); return; }
    c.avisar({});
    const pr = c.apoyo.proveedores[0];
    setB({ id: null, version: 0, fecha: c.hoy, fechaEntrega: c.hoy, proveedorRut: pr.rut, proveedorNombre: pr.nombre, bodegaId: bodegasActivas(c)[0].id, centroCosto: '', condicionPago: '30 DÍAS', observaciones: '', lineas: [lineaOC()] });
  };
  const editar = (x: OrdenCompraI) => { c.avisar({}); setB({ id: x.id, version: x.version, fecha: x.fecha, fechaEntrega: x.fechaEntrega || '', proveedorRut: x.proveedorRut, proveedorNombre: x.proveedorNombre, bodegaId: x.bodegaId, centroCosto: x.centroCosto, condicionPago: x.condicionPago, observaciones: x.observaciones, lineas: x.lineas.map((l) => ({ id: l.id, productoId: l.productoId, cantidad: String(l.cantidad), precioUnitario: String(l.precioUnitario), descuentoPct: String(l.descuentoPct) })) }); };
  if (o) return <><DetalleOC c={c} o={o} volver={() => setAbierta(null)} editar={() => editar(o)} />{b && <FormOC c={c} b={b} setB={setB} abrir={setAbierta} />}</>;
  let filas = c.datos.ordenes.slice().sort((x, y) => String(y.creado).localeCompare(String(x.creado)));
  if (estado) filas = filas.filter((x) => x.estado === estado);
  if (q) { const s = q.toLowerCase(); filas = filas.filter((x) => `${x.folio} ${x.proveedorNombre} ${x.proveedorRut} ${x.observaciones}`.toLowerCase().includes(s)); }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input className="campo max-w-xs" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Folio, proveedor u observación…" aria-label="Buscar orden" />
        <select className="campo max-w-[14rem]" value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Estado"><option value="">Todos los estados</option>{Object.entries(OC_ESTADOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <span className="flex-1" />
        {c.escribe && <button type="button" className="boton" onClick={nueva}>＋ Orden de compra</button>}
      </div>
      <div className="tarjeta overflow-x-auto"><table className="w-full min-w-[820px] text-xs">
        <thead className="text-left text-tenue"><tr className="border-b border-borde"><th className="p-2">Folio</th><th>Fecha</th><th>Proveedor</th><th>Bodega</th><th>Estado</th><th className="text-right">Recepción</th><th className="text-right">Neto</th><th className="text-right">Total</th><th /></tr></thead>
        <tbody>{filas.length ? filas.map((x) => { const t = calcularTotalesOC(x), r = resumenRecepcionOC(x as never, c.datos.recepciones as never); return (
          <tr key={x.id} className="border-b border-borde/30"><td className="num p-2 font-semibold">{x.folio}</td><td>{fechaCorta(x.fecha)}</td><td>{x.proveedorNombre} <span className="text-tenue">{x.proveedorRut}</span></td><td>{nombreBodega(c, x.bodegaId)}</td>
            <td><Badge tono={tonoOC(x.estado)}>{OC_ESTADOS[x.estado] || x.estado}</Badge></td><td className="num text-right">{fmt(r.avance)}%</td><td className="num text-right">{mon(t.neto)}</td><td className="num text-right font-semibold">{mon(t.total)}</td>
            <td className="pr-2 text-right"><button type="button" className="boton-sec !px-2 !py-0.5" onClick={() => { c.avisar({}); setAbierta(x.id); }}>Ver</button></td></tr>); })
          : <Vacio cols={9}>Aún no hay órdenes de compra.</Vacio>}</tbody>
      </table></div>
      {b && <FormOC c={c} b={b} setB={setB} abrir={setAbierta} />}
    </div>
  );
}

function FormOC({ c, b, setB, abrir }: { c: Ctx; b: BorradorOC; setB: (b: BorradorOC | null) => void; abrir: (id: string) => void }) {
  const set = (x: Partial<BorradorOC>) => setB({ ...b, ...x });
  const setL = (i: number, x: Partial<BorradorOC['lineas'][number]>) => setB({ ...b, lineas: b.lineas.map((l, j) => (j === i ? { ...l, ...x } : l)) });
  const tot = calcularTotalesOC({ lineas: conIva(c, b.lineas) });
  const guardar = async (emitir: boolean) => {
    let id = '';
    const ok = await c.run(async () => { const r = await guardarOC(c.empresaId, { ...b, lineas: b.lineas.map((l) => ({ ...l, cantidad: decimalCL(l.cantidad), precioUnitario: decimalCL(l.precioUnitario), descuentoPct: decimalCL(l.descuentoPct) })) }, emitir); if (r.ok && r.id) id = r.id; return r; });
    if (ok) { setB(null); if (id) abrir(id); }
  };
  return (
    <Modal titulo={b.id ? 'Editar orden de compra' : 'Nueva orden de compra'} sub="Los precios se ingresan netos; la recepción generará la entrada valorizada al inventario" onCerrar={() => setB(null)} ancho="max-w-4xl">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="sm:col-span-2"><label className="etiqueta" htmlFor="oc-p">Proveedor</label>
          <select id="oc-p" className="campo" value={b.proveedorRut} onChange={(e) => set({ proveedorRut: e.target.value, proveedorNombre: c.apoyo.proveedores.find((p) => p.rut === e.target.value)?.nombre || '' })}>
            {c.apoyo.proveedores.map((p) => <option key={p.rut} value={p.rut}>{p.rut} · {p.nombre}</option>)}</select></div>
        <div><label className="etiqueta" htmlFor="oc-f">Fecha OC</label><input id="oc-f" type="date" className="campo" value={b.fecha} onChange={(e) => set({ fecha: e.target.value })} /></div>
        <div><label className="etiqueta" htmlFor="oc-e">Entrega esperada</label><input id="oc-e" type="date" className="campo" value={b.fechaEntrega} onChange={(e) => set({ fechaEntrega: e.target.value })} /></div>
        <div><label className="etiqueta" htmlFor="oc-b">Bodega de recepción</label><select id="oc-b" className="campo" value={b.bodegaId} onChange={(e) => set({ bodegaId: e.target.value })}><OpcionesBodega c={c} /></select></div>
        <div><label className="etiqueta" htmlFor="oc-cp">Condición de pago</label><input id="oc-cp" className="campo" value={b.condicionPago} onChange={(e) => set({ condicionPago: e.target.value })} /></div>
        <div className="sm:col-span-2"><label className="etiqueta" htmlFor="oc-cc">Centro de costo</label><select id="oc-cc" className="campo" value={b.centroCosto} onChange={(e) => set({ centroCosto: e.target.value })}><option value="">Sin centro</option>{c.apoyo.centros.map((x) => <option key={x.codigo} value={x.codigo}>{x.codigo} · {x.nombre}</option>)}</select></div>
        <div className="sm:col-span-4"><label className="etiqueta" htmlFor="oc-o">Observaciones</label><input id="oc-o" className="campo" value={b.observaciones} onChange={(e) => set({ observaciones: e.target.value })} /></div>
      </div>
      <h3 className="pt-2 text-xs font-semibold text-tenue uppercase">Productos solicitados</h3>
      {b.lineas.map((l, i) => (
        <div key={l.id} className="grid items-end gap-2 rounded-md border border-borde p-2 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]">
          <div><label className="etiqueta" htmlFor={`ocl-p-${i}`}>Producto</label><select id={`ocl-p-${i}`} className="campo" value={l.productoId} onChange={(e) => setL(i, { productoId: e.target.value })}><OpcionesProducto c={c} /></select></div>
          <div><label className="etiqueta" htmlFor={`ocl-c-${i}`}>Cantidad</label><input id={`ocl-c-${i}`} className="campo num text-right" inputMode="decimal" value={String(l.cantidad)} onChange={(e) => setL(i, { cantidad: e.target.value })} /></div>
          <div><label className="etiqueta" htmlFor={`ocl-u-${i}`}>Precio unitario neto</label><input id={`ocl-u-${i}`} className="campo num text-right" inputMode="decimal" value={String(l.precioUnitario)} onChange={(e) => setL(i, { precioUnitario: e.target.value })} /></div>
          <div><label className="etiqueta" htmlFor={`ocl-d-${i}`}>Descuento %</label><input id={`ocl-d-${i}`} className="campo num text-right" inputMode="decimal" value={String(l.descuentoPct)} onChange={(e) => setL(i, { descuentoPct: e.target.value })} /></div>
          <div className="text-right"><div className="etiqueta">Total neto</div><div className="num font-semibold">{mon(totalLineaOC({ ...l, cantidad: decimalCL(l.cantidad), precioUnitario: decimalCL(l.precioUnitario), descuentoPct: decimalCL(l.descuentoPct) }))}</div></div>
          <button type="button" className="boton-sec" aria-label="Quitar producto" onClick={() => set({ lineas: b.lineas.length === 1 ? [lineaOC()] : b.lineas.filter((_, j) => j !== i) })}>×</button>
        </div>
      ))}
      <button type="button" className="boton-sec" onClick={() => set({ lineas: [...b.lineas, lineaOC()] })}>＋ Agregar producto</button>
      <p className="num text-right">Neto <strong>{mon(tot.neto)}</strong> · IVA <strong>{mon(tot.iva)}</strong> · Total <strong>{mon(tot.total)}</strong></p>
      {c.msg.error && <Mensaje error={c.msg.error} />}
      <div className="flex justify-end gap-2 border-t border-borde pt-3">
        <button type="button" className="boton-sec" onClick={() => setB(null)}>Cancelar</button>
        <button type="button" className="boton-sec" disabled={c.pendiente} onClick={() => guardar(false)}>Guardar borrador</button>
        <button type="button" className="boton" disabled={c.pendiente} onClick={() => guardar(true)}>Guardar y emitir</button>
      </div>
    </Modal>
  );
}

function DetalleOC({ c, o, volver, editar }: { c: Ctx; o: OrdenCompraI; volver: () => void; editar: () => void }) {
  const [rec, setRec] = useState<BorradorRec | null>(null);
  const [vincular, setVincular] = useState<string | null>(null);
  const tot = calcularTotalesOC(o), res = resumenRecepcionOC(o as never, c.datos.recepciones as never);
  const recs = c.datos.recepciones.filter((r) => r.ordenCompraId === o.id).sort((a, b) => String(b.creado).localeCompare(String(a.creado)));
  const abrirRecepcion = () => { c.avisar({}); setRec({ ordenCompraId: o.id, ordenVersion: o.version, fecha: c.hoy, documentoTipo: 'GUÍA', documentoNumero: '', observaciones: '', lineas: res.lineas.filter((l) => l.pendiente > 1e-6).map((l) => ({ k: crypto.randomUUID(), ocLineaId: l.id, productoId: l.productoId, pendiente: l.pendiente, cantidad: '', lote: '', fechaVencimiento: '' })) }); };
  const r = vincular ? c.datos.recepciones.find((x) => x.id === vincular) : null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h2 className="text-lg font-semibold">{o.folio} · {o.proveedorNombre}</h2><p className="text-xs text-tenue">{o.proveedorRut} · {fechaCorta(o.fecha)} · {nombreBodega(c, o.bodegaId)} · versión {o.version}{o.condicionPago ? ` · ${o.condicionPago}` : ''}</p></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="boton-sec" onClick={volver}>← Volver</button>
          {c.escribe && o.estado === 'BORRADOR' && <><button type="button" className="boton-sec" onClick={editar}>Editar</button>
            <button type="button" className="boton" disabled={c.pendiente} onClick={() => confirm(`¿Emitir ${o.folio}? Después sólo podrá recibirse o anularse.`) && c.run(() => cambiarEstadoOC(c.empresaId, o.id, 'emitir'))}>Emitir OC</button></>}
          {c.escribe && ['EMITIDA', 'PARCIAL'].includes(o.estado) && <button type="button" className="boton" onClick={abrirRecepcion}>＋ Recibir</button>}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-4"><Kpi lbl="Estado" v={OC_ESTADOS[o.estado] || o.estado} /><Kpi lbl="Recepción" v={`${fmt(res.avance)}%`} /><Kpi lbl="Pendiente" v={fmt(res.pendiente)} /><Kpi lbl="Total OC" v={mon(tot.total)} /></div>
      <div className="tarjeta overflow-x-auto p-3"><h3 className="mb-2 text-sm font-semibold">Detalle de la orden</h3>
        <table className="w-full min-w-[700px] text-xs"><thead className="text-left text-tenue"><tr className="border-b border-borde"><th className="py-1">Producto</th><th className="text-right">Pedido</th><th className="text-right">Recibido</th><th className="text-right">Pendiente</th><th className="text-right">Precio neto</th><th className="text-right">Desc. %</th><th className="text-right">Total neto</th></tr></thead>
          <tbody>{res.lineas.map((l) => <tr key={l.id} className="border-b border-borde/30"><td className="py-1">{nombreProducto(c, l.productoId)}</td><td className="num text-right">{fmt(l.cantidad)}</td><td className="num text-right">{fmt(l.recibida)}</td><td className="num text-right font-semibold">{fmt(l.pendiente)}</td><td className="num text-right">{mon(l.precioUnitario)}</td><td className="num text-right">{fmt(l.descuentoPct)}</td><td className="num text-right">{mon(totalLineaOC(l))}</td></tr>)}</tbody>
          <tfoot><tr className="font-semibold"><td colSpan={5} className="py-1">Neto {mon(tot.neto)} · IVA {mon(tot.iva)}</td><td>Total</td><td className="num text-right">{mon(tot.total)}</td></tr></tfoot></table></div>
      <div className="tarjeta overflow-x-auto p-3"><h3 className="mb-2 text-sm font-semibold">Recepciones</h3>
        <table className="w-full min-w-[760px] text-xs"><thead className="text-left text-tenue"><tr className="border-b border-borde"><th className="py-1">Folio</th><th>Fecha</th><th>Documento</th><th className="pr-3 text-right">Líneas</th><th>Estado</th><th>Integración contable</th><th>Responsable</th><th /></tr></thead>
          <tbody>{recs.length ? recs.map((x) => { const f = c.apoyo.facturas.find((y) => y.id === x.compraId); return (
            <tr key={x.id} className={`border-b border-borde/30 ${x.estado === 'ANULADA' ? 'text-tenue' : ''}`}><td className="num py-1 font-semibold">{x.folio}</td><td>{fechaCorta(x.fecha)}</td><td>{x.documentoTipo} {x.documentoNumero}</td><td className="num pr-3 text-right">{x.lineas.length}</td>
              <td><Badge tono={x.estado === 'ANULADA' ? 'mal' : 'ok'}>{x.estado}</Badge></td>
              <td>{x.estado === 'ANULADA' ? <Badge tono="tenue">Anulada</Badge> : x.compraId ? <Badge>✅ Conciliada{f ? ` · DTE ${f.tipoDTE} N°${f.folio}` : ''}</Badge> : <><Badge tono="tenue">{x.estadoContable === 'PENDIENTE_CONCILIACION' ? 'Pendiente DTE' : 'Espera factura'}</Badge>{c.escribe && <button type="button" className="ml-1 text-acento hover:underline" onClick={() => { c.avisar({}); setVincular(x.id); }}>🔗 Vincular</button>}</>}</td>
              <td>{x.creadoPor || '–'}</td>
              <td className="text-right">{c.escribe && x.estado !== 'ANULADA' && <button type="button" className="boton-sec !px-2 !py-0.5 text-peligro" disabled={c.pendiente} onClick={() => { const m = pedirMotivo('Motivo de anulación de la recepción:'); if (m && confirm('La entrada de inventario asociada también será anulada. ¿Continuar?')) c.run(() => anularRecepcion(c.empresaId, c.datos.version, x.id, m)); }}>Anular</button>}</td></tr>); })
            : <Vacio cols={8}>Sin recepciones registradas.</Vacio>}</tbody></table></div>
      {o.observaciones && <p className="text-xs text-tenue"><strong>Observaciones:</strong> {o.observaciones}</p>}
      {o.motivoAnulacion && <p className="text-xs text-peligro"><strong>Anulada:</strong> {o.motivoAnulacion}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        {c.escribe && o.estado === 'PARCIAL' && <button type="button" className="boton-sec" disabled={c.pendiente} onClick={() => confirm(`¿Cerrar definitivamente el saldo pendiente de ${o.folio}?`) && c.run(() => cambiarEstadoOC(c.empresaId, o.id, 'cerrar'))}>Cerrar saldo pendiente</button>}
        {c.escribe && ['BORRADOR', 'EMITIDA'].includes(o.estado) && <button type="button" className="boton-sec text-peligro" disabled={c.pendiente} onClick={() => { const m = pedirMotivo('Motivo de anulación:'); if (m) c.run(() => cambiarEstadoOC(c.empresaId, o.id, 'anular', m)); }}>Anular orden</button>}
      </div>

      {rec && (
        <Modal titulo={`Recepción de ${o.folio}`} sub={`${o.proveedorNombre} · destino ${nombreBodega(c, o.bodegaId)}`} onCerrar={() => setRec(null)} ancho="max-w-4xl">
          <div className="grid gap-3 sm:grid-cols-4">
            <div><label className="etiqueta" htmlFor="rc-f">Fecha recepción</label><input id="rc-f" type="date" className="campo" value={rec.fecha} onChange={(e) => setRec({ ...rec, fecha: e.target.value })} /></div>
            <div><label className="etiqueta" htmlFor="rc-t">Tipo documento</label><select id="rc-t" className="campo" value={rec.documentoTipo} onChange={(e) => setRec({ ...rec, documentoTipo: e.target.value })}>{Object.keys(TIPOS_DOC_RECEPCION).map((x) => <option key={x}>{x}</option>)}</select></div>
            <div><label className="etiqueta" htmlFor="rc-n">Número documento</label><input id="rc-n" className="campo" value={rec.documentoNumero} onChange={(e) => setRec({ ...rec, documentoNumero: e.target.value })} /></div>
            <div><label className="etiqueta" htmlFor="rc-o">Observaciones</label><input id="rc-o" className="campo" value={rec.observaciones} onChange={(e) => setRec({ ...rec, observaciones: e.target.value })} /></div>
          </div>
          <h3 className="pt-2 text-xs font-semibold text-tenue uppercase">Cantidades recibidas</h3>
          {rec.lineas.map((l, i) => {
            const p = c.datos.productos.find((x) => x.id === l.productoId);
            const setL = (x: Partial<LineaRec>) => setRec({ ...rec, lineas: rec.lineas.map((y, j) => (j === i ? { ...y, ...x } : y)) });
            const repetida = rec.lineas.filter((x) => x.ocLineaId === l.ocLineaId).length > 1;
            return (
              <div key={l.k} className="grid items-end gap-2 rounded-md border border-borde p-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
                <div><div className="font-medium">{nombreProducto(c, l.productoId)}</div><div className="text-[10px] text-tenue">Pendiente total: {fmt(l.pendiente)} {p?.unidad}</div></div>
                <div><label className="etiqueta" htmlFor={`rc-c-${i}`}>Recibido</label><input id={`rc-c-${i}`} className="campo num text-right" inputMode="decimal" value={String(l.cantidad)} onChange={(e) => setL({ cantidad: e.target.value })} /></div>
                {p?.manejaLotes ? <>
                  <div><label className="etiqueta" htmlFor={`rc-l-${i}`}>Lote</label><input id={`rc-l-${i}`} className="campo" value={l.lote} onChange={(e) => setL({ lote: e.target.value.toUpperCase() })} /></div>
                  <div><label className="etiqueta" htmlFor={`rc-v-${i}`}>Vencimiento</label><input id={`rc-v-${i}`} type="date" className="campo" value={l.fechaVencimiento} onChange={(e) => setL({ fechaVencimiento: e.target.value })} /></div>
                  <div className="flex gap-1"><button type="button" className="boton-sec" onClick={() => setRec({ ...rec, lineas: [...rec.lineas.slice(0, i + 1), { ...l, k: crypto.randomUUID(), cantidad: '', lote: '', fechaVencimiento: '' }, ...rec.lineas.slice(i + 1)] })}>＋ lote</button>
                    {repetida && <button type="button" className="boton-sec" aria-label="Quitar lote" onClick={() => setRec({ ...rec, lineas: rec.lineas.filter((_, j) => j !== i) })}>×</button>}</div>
                </> : <><div /><div /><div /></>}
              </div>
            );
          })}
          {c.msg.error && <Mensaje error={c.msg.error} />}
          <div className="flex justify-end gap-2 border-t border-borde pt-3"><button type="button" className="boton-sec" onClick={() => setRec(null)}>Cancelar</button>
            <button type="button" className="boton" disabled={c.pendiente} onClick={async () => {
              if (await c.run(() => registrarRecepcion(c.empresaId, c.datos.version, { ...rec, lineas: rec.lineas.map((l) => ({ ocLineaId: l.ocLineaId, cantidad: decimalCL(l.cantidad), lote: l.lote, fechaVencimiento: l.fechaVencimiento })) }))) setRec(null);
            }}>Registrar recepción</button></div>
        </Modal>
      )}

      {r && (
        <Modal titulo="Vincular factura de compras" sub={`${r.proveedorNombre} · ${r.documentoTipo} ${r.documentoNumero}`} onCerrar={() => setVincular(null)}>
          {(() => { const cand = comprasVinculables(r, c.apoyo.facturas); return cand.length ? cand.map((f) => (
            <div key={f.id} className="flex items-center justify-between rounded-md border border-borde p-2">
              <div><strong>DTE {f.tipoDTE} N° {f.folio}</strong><div className="text-xs text-tenue">{fechaCorta(f.fecha)} · {mon(f.total)} · {c.datos.recepciones.filter((x) => x.compraId === f.id).length ? `ya vinculada a ${c.datos.recepciones.filter((x) => x.compraId === f.id).length} recepción(es)` : 'sin recepciones'}</div></div>
              <button type="button" className="boton" disabled={c.pendiente} onClick={async () => { if (await c.run(() => vincularFactura(c.empresaId, r.id, f.id))) setVincular(null); }}>Vincular</button>
            </div>)) : <p className="py-4 text-center text-tenue">No hay facturas (33/34) de {r.proveedorNombre} registradas en Compras.</p>; })()}
          {c.msg.error && <Mensaje error={c.msg.error} />}
        </Modal>
      )}
    </div>
  );
}
