'use client';

import { useState } from 'react';
import type { MovimientoI } from '@/inventario/filas';
import { MOTIVOS, DOC_TIPOS_MOV, DOC_TIPOS_PROVEEDOR, nuevoFolio, resumenRecepcionOC } from '@/inventario/motor';
import { decimalCL, decimalInput } from '@/lib/formato';
import { Modal } from '@/components/modal';
import { Mensaje } from '@/components/form-estado';
import { guardarMovimiento, anularMovimiento, type BorradorMov } from './acciones';
import { Badge, OpcionesBodega, OpcionesProducto, Vacio, bodegasActivas, fechaCorta, fmt, mon, nombreBodega, nombreProducto, pedirMotivo, productosDisponibles, type Ctx } from './comun';

type LineaB = BorradorMov['lineas'][number] & { k: string };
type Borrador = Omit<BorradorMov, 'lineas'> & { editId: string | null; folio: string; lineas: LineaB[] };
const lineaVacia = (): LineaB => ({ k: crypto.randomUUID(), productoId: '', cantidad: '', costoUnitario: '', lote: '', fechaVencimiento: '' });

export function Movimientos({ c }: { c: Ctx }) {
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState('');
  const [ver, setVer] = useState<string | null>(null);
  const [b, setB] = useState<Borrador | null>(null);
  let filas = c.datos.movimientos.slice().sort((x, y) => (String(y.fecha) + y.creado).localeCompare(String(x.fecha) + x.creado));
  if (estado) filas = filas.filter((m) => m.estado === estado);
  if (q) { const t = q.toLowerCase(); filas = filas.filter((m) => `${m.folio} ${m.motivo} ${m.documento} ${m.tercero}`.toLowerCase().includes(t)); }
  const folios = c.datos.movimientos.map((m) => m.folio);

  const nuevo = () => {
    c.avisar({});
    if (!bodegasActivas(c).length) { c.avisar({ error: 'Primero crea una bodega activa.' }); return; }
    if (!productosDisponibles(c).length) { c.avisar({ error: 'Primero crea un producto inventariable.' }); return; }
    setB({ editId: null, folio: nuevoFolio('ENTRADA', folios), tipo: 'ENTRADA', fecha: c.hoy, motivo: 'COMPRA', bodegaOrigenId: '', bodegaDestinoId: bodegasActivas(c)[0].id, tercero: '', documentoTipo: 'SIN DOCUMENTO', documentoNumero: '', proveedorRut: '', proveedorNombre: '', ordenCompraId: '', centroCosto: '', observaciones: '', lineas: [lineaVacia()] });
  };
  const editar = (m: MovimientoI) => (c.avisar({}), setB({ editId: m.id, folio: m.folio, tipo: m.tipo, fecha: m.fecha, motivo: m.motivo, bodegaOrigenId: m.bodegaOrigenId || '', bodegaDestinoId: m.bodegaDestinoId || '', tercero: m.tercero, documentoTipo: m.documentoTipo || (m.documento ? 'OTRO' : 'SIN DOCUMENTO'), documentoNumero: m.documentoNumero || '', proveedorRut: m.proveedorRut, proveedorNombre: m.proveedorNombre, ordenCompraId: m.ordenCompraId || '', centroCosto: m.centroCosto, observaciones: m.observaciones,
    lineas: m.lineas.map((l) => ({ k: crypto.randomUUID(), productoId: l.productoId, cantidad: decimalInput(l.cantidad), costoUnitario: l.costoUnitario == null ? '' : decimalInput(l.costoUnitario), lote: l.lote || '', fechaVencimiento: l.fechaVencimiento || '' })) }));
  const vista = ver ? c.datos.movimientos.find((m) => m.id === ver) : null;
  const protegido = (m: MovimientoI) => !!(m.recepcionId || m.tomaId);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input className="campo max-w-xs" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Folio, documento, motivo o tercero…" aria-label="Buscar movimiento" />
        <select className="campo max-w-[12rem]" value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Estado"><option value="">Todos los estados</option><option value="VIGENTE">Vigentes</option><option value="ANULADO">Anulados</option></select>
        <span className="flex-1" />
        {c.escribe && <button type="button" className="boton" onClick={nuevo}>＋ Movimiento</button>}
      </div>
      <div className="tarjeta overflow-x-auto"><table className="w-full min-w-[900px] text-xs">
        <thead className="text-left text-tenue"><tr className="border-b border-borde"><th className="p-2">Folio</th><th>Fecha</th><th>Tipo</th><th>Motivo</th><th>Origen</th><th>Destino</th><th>Documento</th><th className="text-right">Valor</th><th className="px-2">Estado</th><th /></tr></thead>
        <tbody>{filas.length ? filas.map((m) => {
          const v = (c.calc.valorizaciones.get(m.id) || []).reduce((s, l) => s + l.valorAplicado, 0);
          return (
            <tr key={m.id} className={`border-b border-borde/30 ${m.estado === 'ANULADO' ? 'text-tenue line-through decoration-peligro/50' : ''}`}>
              <td className="num p-2 font-semibold">{m.folio}</td><td>{fechaCorta(m.fecha)}</td><td><Badge tono="info">{m.tipo.replace('_', ' ')}</Badge></td><td>{m.motivo || '–'}</td>
              <td>{nombreBodega(c, m.bodegaOrigenId)}</td><td>{nombreBodega(c, m.bodegaDestinoId)}</td><td>{m.documento || '–'}</td><td className="num text-right">{mon(v)}</td>
              <td className="px-2">{m.estado === 'ANULADO' ? <Badge tono="mal">ANULADO</Badge> : <Badge>VIGENTE</Badge>}</td>
              <td className="pr-2 text-right whitespace-nowrap"><button type="button" className="boton-sec !px-2 !py-0.5" onClick={() => setVer(m.id)}>Ver</button>
                {c.escribe && m.estado !== 'ANULADO' && !protegido(m) && <button type="button" className="boton-sec ml-1 !px-2 !py-0.5" title="Editar" onClick={() => editar(m)}>✏️</button>}</td>
            </tr>
          );
        }) : <Vacio cols={10}>Aún no hay movimientos.</Vacio>}</tbody>
      </table></div>

      {vista && (
        <Modal titulo={`Movimiento ${vista.folio}`} sub={`${fechaCorta(vista.fecha)} · ${vista.tipo} · ${vista.estado}`} onCerrar={() => setVer(null)}>
          {vista.estado === 'ANULADO' && <p className="rounded-md border border-peligro/40 bg-peligro/10 p-2 text-peligro"><strong>ANULADO:</strong> {vista.motivoAnulacion || 'Sin detalle'}</p>}
          {vista.estado !== 'ANULADO' && protegido(vista) && <p className="rounded-md border border-borde p-2 text-xs"><strong>Movimiento protegido:</strong> {vista.recepcionId ? 'se administra desde la recepción de su orden de compra.' : 'se administra desde su toma física de inventario.'}</p>}
          {vista.editado && <p className="text-xs text-tenue">✏️ Editado el {fechaCorta(vista.editado)} por {vista.editadoPor || '–'}</p>}
          <div className="grid gap-2 text-xs sm:grid-cols-4">
            {([['Motivo', vista.motivo], ['Documento', vista.documento], ['Proveedor', vista.proveedorNombre || vista.proveedorRut], ['Orden de compra', c.datos.ordenes.find((o) => o.id === vista.ordenCompraId)?.folio], ['Origen', nombreBodega(c, vista.bodegaOrigenId)], ['Destino', nombreBodega(c, vista.bodegaDestinoId)], ['Tercero', vista.tercero], ['Centro de costo', vista.centroCosto], ['Registrado por', vista.creadoPor]] as [string, string | undefined][])
              .filter(([, v]) => v).map(([k, v]) => <div key={k}><div className="text-[10px] text-tenue uppercase">{k}</div><div className="font-medium">{v}</div></div>)}
          </div>
          <table className="w-full text-xs"><thead className="text-left text-tenue"><tr className="border-b border-borde"><th className="py-1">Producto</th><th className="text-right">Cantidad</th><th>Lote</th><th>Vencimiento</th><th className="text-right">Costo aplicado</th><th className="text-right">Valor</th></tr></thead>
            <tbody>{vista.lineas.map((l, i) => { const v = (c.calc.valorizaciones.get(vista.id) || [])[i]; return (
              <tr key={i} className="border-b border-borde/30"><td className="py-1">{nombreProducto(c, l.productoId)}</td><td className="num text-right">{fmt(l.cantidad)}</td><td className="num">{l.lote || '–'}</td><td>{fechaCorta(l.fechaVencimiento)}</td>
                <td className="num text-right">{mon(v?.costoAplicado ?? l.costoUnitario)}</td><td className="num text-right">{mon(v?.valorAplicado ?? Number(l.cantidad) * Number(l.costoUnitario || 0))}</td></tr>); })}</tbody></table>
          {vista.observaciones && <p className="text-xs text-tenue">{vista.observaciones}</p>}
          <div className="flex justify-end gap-2">
            {c.escribe && vista.estado !== 'ANULADO' && !protegido(vista) && <button type="button" className="boton-sec" onClick={() => { editar(vista); setVer(null); }}>✏️ Editar</button>}
            {c.escribe && vista.estado !== 'ANULADO' && !vista.recepcionId && <button type="button" className="boton-sec text-peligro" disabled={c.pendiente} onClick={async () => {
              const motivo = pedirMotivo('Motivo obligatorio de la anulación:'); if (!motivo) return;
              if (await c.run(() => anularMovimiento(c.empresaId, c.datos.version, vista.id, motivo))) setVer(null);
            }}>Anular movimiento</button>}
            <button type="button" className="boton-sec" onClick={() => setVer(null)}>Cerrar</button>
          </div>
        </Modal>
      )}

      {b && <FormMovimiento c={c} b={b} setB={setB} folios={folios} />}
    </div>
  );
}

function FormMovimiento({ c, b, setB, folios }: { c: Ctx; b: Borrador; setB: (b: Borrador | null) => void; folios: string[] }) {
  const set = (x: Partial<Borrador>) => setB({ ...b, ...x });
  const setL = (i: number, x: Partial<LineaB>) => setB({ ...b, lineas: b.lineas.map((l, j) => (j === i ? { ...l, ...x } : l)) });
  const esEnt = b.tipo === 'ENTRADA', esSal = b.tipo === 'SALIDA';
  const conProv = esEnt && DOC_TIPOS_PROVEEDOR.includes(b.documentoTipo);
  const ocsAbiertas = b.proveedorRut ? c.datos.ordenes.filter((o) => ['EMITIDA', 'PARCIAL'].includes(o.estado) && o.proveedorRut === b.proveedorRut) : [];
  const ocSel = c.datos.ordenes.find((o) => o.id === b.ordenCompraId);
  const pendOC = ocSel ? resumenRecepcionOC(ocSel as never, c.datos.recepciones as never).lineas.filter((l) => l.pendiente > 0) : [];
  const guardar = async () => {
    const { editId, folio: _f, lineas, ...resto } = b; void _f;
    if (await c.run(() => guardarMovimiento(c.empresaId, c.datos.version, editId, { ...resto, lineas: lineas.map(({ k: _k, ...l }) => { void _k; return { ...l, cantidad: decimalCL(l.cantidad), costoUnitario: decimalCL(l.costoUnitario) }; }) }))) setB(null);
  };
  return (
    <Modal titulo={b.editId ? 'Editar movimiento' : 'Nuevo movimiento'} sub={b.editId ? 'Los cambios se reflejan de inmediato en el stock y el PPP recalculados' : 'El stock y el PPP se recalculan desde este libro cronológico'} onCerrar={() => setB(null)} ancho="max-w-4xl">
      <p className="num text-xs text-tenue">Folio interno: <strong className="text-texto">{b.folio}</strong> {b.editId ? '(se conserva)' : '(próximo correlativo; se confirma al guardar)'}</p>
      <div className="grid gap-3 sm:grid-cols-4">
        <div><label className="etiqueta" htmlFor="mv-tipo">Tipo</label>
          <select id="mv-tipo" className="campo" value={b.tipo} disabled={!!b.editId} onChange={(e) => set({ tipo: e.target.value, motivo: MOTIVOS[e.target.value][0], folio: nuevoFolio(e.target.value, folios), lineas: b.lineas.map((l) => ({ ...l, lote: '', fechaVencimiento: '' })) })}>
            {['ENTRADA', 'SALIDA', 'TRASPASO'].map((x) => <option key={x}>{x}</option>)}</select></div>
        <div><label className="etiqueta" htmlFor="mv-fecha">Fecha</label><input id="mv-fecha" type="date" className="campo" value={b.fecha} onChange={(e) => set({ fecha: e.target.value })} /></div>
        <div><label className="etiqueta" htmlFor="mv-motivo">Motivo</label><select id="mv-motivo" className="campo" value={b.motivo} onChange={(e) => set({ motivo: e.target.value })}>{MOTIVOS[b.tipo].map((x) => <option key={x}>{x}</option>)}</select></div>
        <div><label className="etiqueta" htmlFor="mv-cc">Centro de costo</label><select id="mv-cc" className="campo" value={b.centroCosto} onChange={(e) => set({ centroCosto: e.target.value })}><option value="">Sin centro</option>{c.apoyo.centros.map((x) => <option key={x.codigo} value={x.codigo}>{x.codigo} · {x.nombre}</option>)}</select></div>
        {!esEnt && <div><label className="etiqueta" htmlFor="mv-orig">Bodega origen</label><select id="mv-orig" className="campo" value={b.bodegaOrigenId} onChange={(e) => set({ bodegaOrigenId: e.target.value })}><OpcionesBodega c={c} /></select></div>}
        {!esSal && <div><label className="etiqueta" htmlFor="mv-dest">Bodega destino</label><select id="mv-dest" className="campo" value={b.bodegaDestinoId} onChange={(e) => set({ bodegaDestinoId: e.target.value })}><OpcionesBodega c={c} /></select></div>}
        <div><label className="etiqueta" htmlFor="mv-ter">Tercero / responsable</label><input id="mv-ter" className="campo" value={b.tercero} onChange={(e) => set({ tercero: e.target.value })} /></div>
        <div><label className="etiqueta" htmlFor="mv-dt">Tipo de documento</label><select id="mv-dt" className="campo" value={b.documentoTipo} onChange={(e) => set({ documentoTipo: e.target.value, documentoNumero: e.target.value === 'SIN DOCUMENTO' ? '' : b.documentoNumero })}>{DOC_TIPOS_MOV.map((x) => <option key={x}>{x}</option>)}</select></div>
        {b.documentoTipo !== 'SIN DOCUMENTO' && <div><label className="etiqueta" htmlFor="mv-dn">N° de documento</label><input id="mv-dn" className="campo" value={b.documentoNumero} onChange={(e) => set({ documentoNumero: e.target.value })} /></div>}
        {conProv && <>
          <div className="sm:col-span-2"><label className="etiqueta" htmlFor="mv-prov">Proveedor</label>
            <select id="mv-prov" className="campo" value={b.proveedorRut} onChange={(e) => set({ proveedorRut: e.target.value, proveedorNombre: c.apoyo.proveedores.find((p) => p.rut === e.target.value)?.nombre || '', ordenCompraId: '' })}>
              <option value="">Seleccione…</option>{c.apoyo.proveedores.map((p) => <option key={p.rut} value={p.rut}>{p.rut} · {p.nombre}</option>)}</select></div>
          <div className="sm:col-span-2"><label className="etiqueta" htmlFor="mv-oc">Orden de compra</label>
            <select id="mv-oc" className="campo" value={b.ordenCompraId} disabled={!b.proveedorRut} onChange={(e) => set({ ordenCompraId: e.target.value })}>
              <option value="">Sin orden de compra</option>{ocsAbiertas.map((o) => <option key={o.id} value={o.id}>{o.folio} · {fechaCorta(o.fecha)} · pendiente {fmt(resumenRecepcionOC(o as never, c.datos.recepciones as never).pendiente)}</option>)}</select></div>
          {ocSel && <p className="text-xs text-tenue sm:col-span-4">{pendOC.length ? <><strong>Pendiente por recibir de {ocSel.folio}:</strong> {pendOC.map((l) => `${nombreProducto(c, l.productoId)} (${fmt(l.pendiente)})`).join(' · ')}</> : 'Esta orden ya no tiene saldo pendiente por recibir.'}</p>}
        </>}
        <div className="sm:col-span-4"><label className="etiqueta" htmlFor="mv-obs">Observaciones</label><input id="mv-obs" className="campo" value={b.observaciones} onChange={(e) => set({ observaciones: e.target.value })} /></div>
      </div>
      <h3 className="pt-2 text-xs font-semibold text-tenue uppercase">Detalle</h3>
      {b.lineas.map((l, i) => {
        const p = c.datos.productos.find((x) => x.id === l.productoId);
        const st = p && b.bodegaOrigenId ? c.calc.stock.find((x) => x.productoId === p.id && x.bodegaId === b.bodegaOrigenId) : null;
        const lotes = p?.manejaLotes && !esEnt ? c.calc.lotes.filter((x) => x.productoId === p.id && x.bodegaId === b.bodegaOrigenId && x.cantidad > 0) : [];
        return (
          <div key={l.k} className="grid items-end gap-2 rounded-md border border-borde p-2 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]">
            <div><label className="etiqueta" htmlFor={`mv-p-${i}`}>Producto</label><select id={`mv-p-${i}`} className="campo" value={l.productoId} onChange={(e) => setL(i, { productoId: e.target.value, lote: '', fechaVencimiento: '' })}><OpcionesProducto c={c} /></select>
              {p && !esEnt && <span className="text-[10px] text-tenue">Disponible: {fmt(st?.cantidad || 0)} {p.unidad}</span>}</div>
            <div><label className="etiqueta" htmlFor={`mv-c-${i}`}>Cantidad</label><input id={`mv-c-${i}`} className="campo num text-right" inputMode="decimal" value={decimalInput(l.cantidad)} onChange={(e) => setL(i, { cantidad: decimalInput(e.target.value) })} /></div>
            {esEnt ? <div><label className="etiqueta" htmlFor={`mv-u-${i}`}>Costo unitario neto</label><input id={`mv-u-${i}`} className="campo num text-right" inputMode="decimal" value={decimalInput(l.costoUnitario ?? '')} onChange={(e) => setL(i, { costoUnitario: decimalInput(e.target.value) })} /></div> : <div />}
            {p?.manejaLotes ? (esEnt ? <>
              <div><label className="etiqueta" htmlFor={`mv-l-${i}`}>Lote</label><input id={`mv-l-${i}`} className="campo" value={l.lote} onChange={(e) => setL(i, { lote: e.target.value.toUpperCase() })} /></div>
              <div><label className="etiqueta" htmlFor={`mv-v-${i}`}>Vencimiento</label><input id={`mv-v-${i}`} type="date" className="campo" value={l.fechaVencimiento} onChange={(e) => setL(i, { fechaVencimiento: e.target.value })} /></div>
            </> : <div className="sm:col-span-2"><label className="etiqueta" htmlFor={`mv-l-${i}`}>Lote</label>
              <select id={`mv-l-${i}`} className="campo" value={l.lote} onChange={(e) => setL(i, { lote: e.target.value, fechaVencimiento: lotes.find((x) => x.lote === e.target.value)?.fechaVencimiento || '' })}>
                <option value="">Seleccione lote…</option>{lotes.map((x) => <option key={x.lote} value={x.lote}>{x.lote} · {fmt(x.cantidad)} · vence {fechaCorta(x.fechaVencimiento)}</option>)}</select></div>) : <><div /><div /></>}
            <button type="button" className="boton-sec" aria-label="Quitar línea" onClick={() => setB({ ...b, lineas: b.lineas.length === 1 ? [lineaVacia()] : b.lineas.filter((_, j) => j !== i) })}>×</button>
            {esEnt && l.cantidad !== '' && l.costoUnitario !== '' && <p className="text-right text-[11px] text-tenue sm:col-span-6">Total neto línea: <strong className="text-texto">{mon(decimalCL(l.cantidad) * decimalCL(l.costoUnitario))}</strong></p>}
          </div>
        );
      })}
      <button type="button" className="boton-sec" onClick={() => set({ lineas: [...b.lineas, lineaVacia()] })}>＋ Agregar línea</button>
      {c.msg.error && <Mensaje error={c.msg.error} />}
      <div className="flex justify-end gap-2 border-t border-borde pt-3">
        <button type="button" className="boton-sec" onClick={() => setB(null)}>Cancelar</button>
        <button type="button" className="boton" disabled={c.pendiente} onClick={guardar}>{c.pendiente ? 'Guardando…' : b.editId ? 'Guardar cambios' : 'Guardar movimiento'}</button>
      </div>
    </Modal>
  );
}
