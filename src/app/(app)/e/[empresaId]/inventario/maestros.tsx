'use client';

import { useState } from 'react';
import type { BodegaI, GrupoI } from '@/inventario/filas';
import { Modal } from '@/components/modal';
import { Mensaje } from '@/components/form-estado';
import { guardarBodega, guardarGrupo } from './acciones';
import { Badge, type Ctx } from './comun';

export function Bodegas({ c }: { c: Ctx }) {
  const [ed, setEd] = useState<{ id: string | null; codigo: string; nombre: string; direccion: string; activo: boolean } | null>(null);
  const abrir = (b?: BodegaI) => { c.avisar({}); setEd(b ? { id: b.id, codigo: b.codigo, nombre: b.nombre, direccion: b.direccion, activo: b.activo } : { id: null, codigo: '', nombre: '', direccion: '', activo: true }); };
  return (
    <div className="space-y-3">
      {c.escribe && <div className="flex justify-end"><button type="button" className="boton" onClick={() => abrir()}>＋ Bodega</button></div>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {c.datos.bodegas.length ? c.datos.bodegas.map((b) => (
          <div key={b.id} className="tarjeta flex items-start justify-between gap-3 p-4 text-sm">
            <div><div className="num text-xs text-tenue">{b.codigo}</div><div className="font-semibold">{b.nombre}</div><div className="text-xs text-tenue">{b.direccion || 'Sin dirección registrada'}</div><div className="mt-1"><Badge tono={b.activo ? 'ok' : 'tenue'}>{b.activo ? 'ACTIVA' : 'INACTIVA'}</Badge></div></div>
            {c.escribe && <button type="button" className="boton-sec !px-2 !py-0.5" onClick={() => abrir(b)}>Editar</button>}
          </div>
        )) : <p className="tarjeta p-6 text-center text-tenue sm:col-span-3">Crea la primera bodega para comenzar a registrar inventario.</p>}
      </div>
      {ed && (
        <Modal titulo={ed.id ? 'Editar bodega' : 'Nueva bodega'} onCerrar={() => setEd(null)} ancho="max-w-lg">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="etiqueta" htmlFor="bd-c">Código</label><input id="bd-c" className="campo" value={ed.codigo} maxLength={20} onChange={(e) => setEd({ ...ed, codigo: e.target.value })} /></div>
            <div><label className="etiqueta" htmlFor="bd-n">Nombre</label><input id="bd-n" className="campo" value={ed.nombre} maxLength={100} onChange={(e) => setEd({ ...ed, nombre: e.target.value })} /></div>
            <div className="sm:col-span-2"><label className="etiqueta" htmlFor="bd-d">Dirección</label><input id="bd-d" className="campo" value={ed.direccion} maxLength={160} onChange={(e) => setEd({ ...ed, direccion: e.target.value })} /></div>
            <label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" checked={ed.activo} onChange={(e) => setEd({ ...ed, activo: e.target.checked })} />Bodega activa</label>
          </div>
          {c.msg.error && <Mensaje error={c.msg.error} />}
          <div className="flex justify-end gap-2"><button type="button" className="boton-sec" onClick={() => setEd(null)}>Cancelar</button>
            <button type="button" className="boton" disabled={c.pendiente} onClick={async () => { const { id, ...f } = ed; if (await c.run(() => guardarBodega(c.empresaId, id, f))) setEd(null); }}>Guardar</button></div>
        </Modal>
      )}
    </div>
  );
}

export function Grupos({ c }: { c: Ctx }) {
  const [ed, setEd] = useState<{ id: string | null; nombre: string; subgrupos: string } | null>(null);
  const abrir = (g?: GrupoI) => { c.avisar({}); setEd(g ? { id: g.id, nombre: g.nombre, subgrupos: g.subgrupos.join(', ') } : { id: null, nombre: '', subgrupos: '' }); };
  return (
    <div className="space-y-3">
      {c.escribe && <div className="flex justify-end"><button type="button" className="boton" onClick={() => abrir()}>＋ Grupo</button></div>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {c.datos.grupos.length ? c.datos.grupos.map((g) => (
          <div key={g.id} className="tarjeta flex items-start justify-between gap-3 p-4 text-sm">
            <div><div className="font-semibold">{g.nombre}</div><div className="mt-1 flex flex-wrap gap-1">{g.subgrupos.length ? g.subgrupos.map((s) => <Badge key={s} tono="tenue">{s}</Badge>) : <em className="text-xs text-tenue">Sin subgrupos</em>}</div></div>
            {c.escribe && <button type="button" className="boton-sec !px-2 !py-0.5" onClick={() => abrir(g)}>Editar</button>}
          </div>
        )) : <p className="tarjeta p-6 text-center text-tenue sm:col-span-3">Crea grupos para clasificar los productos.</p>}
      </div>
      {ed && (
        <Modal titulo={ed.id ? 'Editar grupo' : 'Nuevo grupo'} onCerrar={() => setEd(null)} ancho="max-w-lg">
          <div><label className="etiqueta" htmlFor="gr-n">Nombre</label><input id="gr-n" className="campo" value={ed.nombre} maxLength={80} onChange={(e) => setEd({ ...ed, nombre: e.target.value })} /></div>
          <div><label className="etiqueta" htmlFor="gr-s">Subgrupos separados por coma</label><textarea id="gr-s" className="campo" rows={4} value={ed.subgrupos} onChange={(e) => setEd({ ...ed, subgrupos: e.target.value })} /></div>
          {c.msg.error && <Mensaje error={c.msg.error} />}
          <div className="flex justify-end gap-2"><button type="button" className="boton-sec" onClick={() => setEd(null)}>Cancelar</button>
            <button type="button" className="boton" disabled={c.pendiente} onClick={async () => { const { id, ...f } = ed; if (await c.run(() => guardarGrupo(c.empresaId, id, f))) setEd(null); }}>Guardar</button></div>
        </Modal>
      )}
    </div>
  );
}
