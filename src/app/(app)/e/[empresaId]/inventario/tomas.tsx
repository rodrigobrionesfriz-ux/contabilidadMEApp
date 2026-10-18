'use client';

import { useState } from 'react';
import type { TomaI } from '@/inventario/filas';
import { TOMA_ESTADOS, rebasarLineaToma, type Movimiento, type Toma } from '@/inventario/motor';
import { decimalCL } from '@/lib/formato';
import { Modal } from '@/components/modal';
import { Mensaje } from '@/components/form-estado';
import { crearToma, contarToma, agregarLineaToma, cambiarEstadoToma, autorizarToma } from './acciones';
import { Badge, Kpi, OpcionesBodega, OpcionesProducto, Vacio, bodegasActivas, fechaCorta, fmt, mon, nombreBodega, pedirMotivo, type Ctx } from './comun';

const tonoEstado = (e: string) => (e === 'APLICADA' ? 'ok' : e === 'RECHAZADA' ? 'mal' : e === 'PENDIENTE_AUTORIZACION' ? 'aviso' : e === 'DEVUELTA' ? 'aviso' : 'info') as 'ok' | 'mal' | 'aviso' | 'info';
const revisar = (c: Ctx, t: TomaI) => (l: TomaI['lineas'][number]) => rebasarLineaToma(l, t as unknown as Toma, c.datos.movimientos as unknown as Movimiento[], c.calc);

export function Tomas({ c }: { c: Ctx }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState('');
  const t = abierta ? c.datos.tomas.find((x) => x.id === abierta) : null;
  if (t) return <DetalleToma c={c} t={t} volver={() => setAbierta(null)} />;
  let filas = c.datos.tomas.slice().sort((a, b) => String(b.creado).localeCompare(String(a.creado)));
  if (estado) filas = filas.filter((x) => x.estado === estado);
  if (q) { const s = q.toLowerCase(); filas = filas.filter((x) => `${x.folio} ${x.observaciones} ${x.creadoPor}`.toLowerCase().includes(s)); }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input className="campo max-w-xs" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Folio, observación o usuario…" aria-label="Buscar toma" />
        <select className="campo max-w-[14rem]" value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Estado"><option value="">Todos los estados</option>{Object.entries(TOMA_ESTADOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <span className="flex-1" />
        {c.escribe && <button type="button" className="boton" onClick={() => { if (!bodegasActivas(c).length) { c.avisar({ error: 'Primero crea una bodega activa.' }); return; } c.avisar({}); setNueva(true); }}>＋ Iniciar toma</button>}
      </div>
      <div className="tarjeta overflow-x-auto"><table className="w-full min-w-[800px] text-xs">
        <thead className="text-left text-tenue"><tr className="border-b border-borde"><th className="p-2">Folio</th><th>Inicio</th><th>Bodega</th><th>Estado</th><th className="text-right">Líneas</th><th className="text-right">Contadas</th><th className="text-right">Diferencias</th><th className="px-2">Usuario</th><th /></tr></thead>
        <tbody>{filas.length ? filas.map((x) => {
          const cont = x.lineas.filter((l) => l.contado).length;
          const dif = x.lineas.filter((l) => l.contado && Math.abs(revisar(c, x)(l).diferencia) > 1e-6).length;
          return (
            <tr key={x.id} className="border-b border-borde/30"><td className="num p-2 font-semibold">{x.folio}</td><td>{fechaCorta(x.creado)}</td><td>{nombreBodega(c, x.bodegaId)}</td>
              <td><Badge tono={tonoEstado(x.estado)}>{TOMA_ESTADOS[x.estado] || x.estado}</Badge></td><td className="num text-right">{x.lineas.length}</td><td className="num text-right">{cont}</td><td className="num text-right">{dif}</td><td className="px-2">{x.creadoPor || '–'}</td>
              <td className="pr-2 text-right"><button type="button" className="boton-sec !px-2 !py-0.5" onClick={() => { c.avisar({}); setAbierta(x.id); }}>{['EN_PROCESO', 'DEVUELTA'].includes(x.estado) && c.escribe ? 'Continuar' : 'Ver'}</button></td></tr>
          );
        }) : <Vacio cols={9}>Aún no hay tomas físicas.</Vacio>}</tbody>
      </table></div>
      {nueva && <NuevaToma c={c} cerrar={() => setNueva(false)} abrir={(id) => { setNueva(false); setAbierta(id); }} />}
    </div>
  );
}

function NuevaToma({ c, cerrar, abrir }: { c: Ctx; cerrar: () => void; abrir: (id: string) => void }) {
  const [f, setF] = useState({ bodegaId: bodegasActivas(c)[0]?.id || '', alcance: 'CON_STOCK', grupoId: '', observaciones: '' });
  return (
    <Modal titulo="Iniciar toma física" sub="Se congela una referencia inicial; la autorización rebasa los movimientos posteriores a cada conteo" onCerrar={cerrar}>
      <p className="rounded-md border border-borde p-2 text-xs"><strong>Conteo seguro:</strong> no es necesario bloquear la bodega. Si hay entradas, salidas o traspasos durante la toma, el sistema los incorpora al calcular el ajuste final.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="etiqueta" htmlFor="tm-b">Bodega</label><select id="tm-b" className="campo" value={f.bodegaId} onChange={(e) => setF({ ...f, bodegaId: e.target.value })}><OpcionesBodega c={c} /></select></div>
        <div><label className="etiqueta" htmlFor="tm-a">Alcance</label><select id="tm-a" className="campo" value={f.alcance} onChange={(e) => setF({ ...f, alcance: e.target.value })}><option value="CON_STOCK">Productos/lotes con stock</option><option value="TODOS">Todos los productos sin lote y lotes existentes</option></select></div>
        <div><label className="etiqueta" htmlFor="tm-g">Grupo</label><select id="tm-g" className="campo" value={f.grupoId} onChange={(e) => setF({ ...f, grupoId: e.target.value })}><option value="">Todos los grupos</option>{c.datos.grupos.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}</select></div>
        <div><label className="etiqueta" htmlFor="tm-o">Observaciones</label><input id="tm-o" className="campo" value={f.observaciones} placeholder="Cierre mensual, conteo cíclico…" onChange={(e) => setF({ ...f, observaciones: e.target.value })} /></div>
      </div>
      {c.msg.error && <Mensaje error={c.msg.error} />}
      <div className="flex justify-end gap-2"><button type="button" className="boton-sec" onClick={cerrar}>Cancelar</button>
        <button type="button" className="boton" disabled={c.pendiente} onClick={async () => {
          let id = ''; const ok = await c.run(async () => { const r = await crearToma(c.empresaId, c.datos.version, f); if (r.ok && r.id) id = r.id; return r; });
          if (ok && id) abrir(id);
        }}>Iniciar</button></div>
    </Modal>
  );
}

function DetalleToma({ c, t, volver }: { c: Ctx; t: TomaI; volver: () => void }) {
  const [q, setQ] = useState('');
  const [agregar, setAgregar] = useState(false);
  const editable = ['EN_PROCESO', 'DEVUELTA'].includes(t.estado) && c.escribe;
  const rev = revisar(c, t);
  const contadas = t.lineas.filter((l) => l.contado).length, pend = t.lineas.length - contadas;
  const difs = t.lineas.filter((l) => l.contado && Math.abs(rev(l).diferencia) > 1e-6).length;
  let lineas = t.lineas.map((l) => ({ l, p: c.datos.productos.find((x) => x.id === l.productoId) }));
  if (q) { const s = q.toLowerCase(); lineas = lineas.filter((x) => `${x.p?.codigo} ${x.p?.descripcion} ${x.l.lote}`.toLowerCase().includes(s)); }
  const contar = (lineaId: string, fisico: number | null, costo: number | null) => c.run(() => contarToma(c.empresaId, t.id, lineaId, fisico, costo));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h2 className="text-lg font-semibold">{t.folio} · {nombreBodega(c, t.bodegaId)}</h2><p className="text-xs text-tenue">{TOMA_ESTADOS[t.estado] || t.estado} · versión {t.version} · iniciada por {t.creadoPor || '–'}</p></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="boton-sec" onClick={volver}>← Volver</button>
          {editable && <button type="button" className="boton-sec" onClick={() => { c.avisar({}); setAgregar(true); }}>＋ Producto/lote</button>}
          {editable && <button type="button" className="boton" disabled={c.pendiente} onClick={() => confirm(`¿Cerrar ${t.folio} y enviarla a autorización?`) && c.run(() => cambiarEstadoToma(c.empresaId, t.id, 'cerrar'))}>Cerrar para autorización</button>}
        </div>
      </div>
      {t.estado === 'DEVUELTA' && <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm text-amber-500"><strong>Devuelta:</strong> {t.motivo}</p>}
      {t.estado === 'RECHAZADA' && <p className="rounded-md border border-peligro/40 bg-peligro/10 p-2 text-sm text-peligro"><strong>Rechazada:</strong> {t.motivo}</p>}
      {t.estado === 'APLICADA' && <p className="rounded-md border border-acento/40 bg-acento/10 p-2 text-sm"><strong>Ajustes aplicados:</strong> {t.movimientosAjuste.join(', ') || 'sin diferencias'} · autorizada por {t.resueltoPor || '–'}</p>}
      <div className="grid gap-3 sm:grid-cols-4"><Kpi lbl="Líneas" v={t.lineas.length} /><Kpi lbl="Contadas" v={contadas} /><Kpi lbl="Pendientes" v={pend} aviso={pend > 0} /><Kpi lbl="Diferencias actuales" v={difs} aviso={difs > 0} /></div>
      <input className="campo max-w-xs" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto o lote…" aria-label="Buscar en la toma" />
      <div className="tarjeta overflow-x-auto"><table className="w-full min-w-[980px] text-xs">
        <thead className="text-left text-tenue"><tr className="border-b border-borde"><th className="p-2">Código</th><th>Producto</th><th>Lote / vencimiento</th><th className="text-right">Teórico inicial</th><th className="text-right">Físico contado</th><th className="text-right">Mov. posteriores</th><th className="text-right">Objetivo actual</th><th className="text-right">Diferencia</th><th className="pr-2 text-right">Costo ajuste</th></tr></thead>
        <tbody>{lineas.length ? lineas.map(({ l, p }) => {
          const r = l.contado ? rev(l) : null, dif = r?.diferencia || 0;
          return (
            <tr key={l.id} className={`border-b border-borde/30 ${l.contado && Math.abs(dif) > 1e-6 ? 'bg-amber-500/5' : ''}`}>
              <td className="num p-2">{p?.codigo}</td><td className="font-medium">{p?.descripcion || l.productoId} <span className="text-tenue">{p?.unidad}</span></td>
              <td className="num">{l.lote || '–'} <span className="text-tenue">{l.fechaVencimiento ? fechaCorta(l.fechaVencimiento) : ''}</span></td>
              <td className="num text-right">{fmt(l.teoricoBase)}</td>
              <td className="text-right">{editable ? <input key={String(l.fisico)} aria-label={`Físico de ${p?.codigo} ${l.lote}`} className="campo num w-24 !py-1 text-right" inputMode="decimal" defaultValue={l.contado ? String(l.fisico) : ''}
                onBlur={(e) => { const s = e.target.value.trim(); const v = s === '' ? null : decimalCL(s); if (v !== (l.contado ? l.fisico : null)) contar(l.id, v, null); }} /> : l.contado ? <strong className="num">{fmt(l.fisico)}</strong> : '–'}</td>
              <td className="num text-right">{r ? fmt(r.posteriores) : '–'}</td><td className="num text-right">{r ? fmt(r.objetivo) : '–'}</td>
              <td className={`num text-right font-semibold ${dif > 0 ? 'text-acento' : dif < 0 ? 'text-peligro' : ''}`}>{r ? (dif > 0 ? '+' : '') + fmt(dif) : '–'}</td>
              <td className="pr-2 text-right">{editable && Number(l.costoBase) <= 0 ? <input key={String(l.costoConteo)} aria-label={`Costo de ${p?.codigo}`} className="campo num w-24 !py-1 text-right" inputMode="decimal" placeholder="$" defaultValue={l.costoConteo ? String(l.costoConteo) : ''}
                onBlur={(e) => { const v = decimalCL(e.target.value); if (v !== Number(l.costoConteo || 0)) contar(l.id, null, v); }} /> : <span className="num">{mon(l.costoConteo || l.costoBase)}</span>}</td>
            </tr>
          );
        }) : <Vacio cols={9}>Sin líneas para mostrar.</Vacio>}</tbody>
      </table></div>
      {t.observaciones && <p className="text-xs text-tenue"><strong>Observaciones:</strong> {t.observaciones}</p>}
      {t.estado === 'PENDIENTE_AUTORIZACION' && c.escribe && (
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="boton-sec" disabled={c.pendiente} onClick={() => { const m = pedirMotivo('Motivo de la devolución:'); if (m) c.run(() => cambiarEstadoToma(c.empresaId, t.id, 'devolver', m)); }}>↩ Devolver</button>
          <button type="button" className="boton-sec text-peligro" disabled={c.pendiente} onClick={() => { const m = pedirMotivo('Motivo del rechazo definitivo:'); if (m && confirm('La toma se archivará sin aplicar ajustes. ¿Continuar?')) c.run(() => cambiarEstadoToma(c.empresaId, t.id, 'rechazar', m)); }}>Rechazar</button>
          <button type="button" className="boton" disabled={c.pendiente} onClick={() => confirm(`¿Autorizar ${t.folio} y generar los ajustes de inventario?`) && c.run(() => autorizarToma(c.empresaId, c.datos.version, t.id))}>✓ Autorizar y aplicar</button>
        </div>
      )}
      {agregar && <AgregarLinea c={c} t={t} cerrar={() => setAgregar(false)} />}
    </div>
  );
}

function AgregarLinea({ c, t, cerrar }: { c: Ctx; t: TomaI; cerrar: () => void }) {
  const [f, setF] = useState({ productoId: '', lote: '', fechaVencimiento: '', fisico: '', costo: '' });
  const p = c.datos.productos.find((x) => x.id === f.productoId);
  return (
    <Modal titulo={`Agregar producto o lote a ${t.folio}`} sub="Úsalo para productos omitidos o para un lote nuevo detectado físicamente" onCerrar={cerrar}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className="etiqueta" htmlFor="tl-p">Producto</label><select id="tl-p" className="campo" value={f.productoId} onChange={(e) => setF({ ...f, productoId: e.target.value })}><OpcionesProducto c={c} /></select></div>
        {p?.manejaLotes && <>
          <div><label className="etiqueta" htmlFor="tl-l">Lote</label><input id="tl-l" className="campo" value={f.lote} onChange={(e) => setF({ ...f, lote: e.target.value.toUpperCase() })} /></div>
          <div><label className="etiqueta" htmlFor="tl-v">Vencimiento</label><input id="tl-v" type="date" className="campo" value={f.fechaVencimiento} onChange={(e) => setF({ ...f, fechaVencimiento: e.target.value })} /></div>
        </>}
        <div><label className="etiqueta" htmlFor="tl-f">Cantidad física</label><input id="tl-f" className="campo num text-right" inputMode="decimal" value={f.fisico} onChange={(e) => setF({ ...f, fisico: e.target.value })} /></div>
        <div><label className="etiqueta" htmlFor="tl-c">Costo unitario si no existe PPP</label><input id="tl-c" className="campo num text-right" inputMode="decimal" value={f.costo} onChange={(e) => setF({ ...f, costo: e.target.value })} /></div>
      </div>
      {c.msg.error && <Mensaje error={c.msg.error} />}
      <div className="flex justify-end gap-2"><button type="button" className="boton-sec" onClick={cerrar}>Cancelar</button>
        <button type="button" className="boton" disabled={c.pendiente} onClick={async () => {
          if (await c.run(() => agregarLineaToma(c.empresaId, t.id, { productoId: f.productoId, lote: f.lote, fechaVencimiento: f.fechaVencimiento, fisico: f.fisico.trim() === '' ? null : decimalCL(f.fisico), costo: decimalCL(f.costo) }))) cerrar();
        }}>Agregar</button></div>
    </Modal>
  );
}
