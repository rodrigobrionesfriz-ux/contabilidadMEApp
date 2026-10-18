'use client';

import { useActionState, useState, useTransition } from 'react';
import { crearCentro, actualizarCentro } from './acciones';
import type { EstadoForm } from '../../../../(auth)/acciones';
import { BotonEnviar, Mensaje } from '@/components/form-estado';

export interface Centro { codigo: string; nombre: string; nivel: number; padre: string | null; estado: string; activo: boolean }

export const ESTADOS_CC: Record<string, string> = {
  normal: 'Normal', operativo: 'Operativo', formacion: '⏳ Inversión en curso', capitalizado: '✓ Capitalizado',
};

export function FilaCentro({ empresaId, c, editable }: { empresaId: string; c: Centro; editable: boolean }) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(c.nombre);
  const [error, setError] = useState('');
  const [pendiente, iniciar] = useTransition();
  const guardar = (cambios: Parameters<typeof actualizarCentro>[2]) => iniciar(async () => {
    const r = await actualizarCentro(empresaId, c.codigo, cambios);
    setError(r.error ?? '');
    if (!r.error) setEditando(false);
  });
  return (
    <div className={`flex flex-wrap items-center gap-3 px-4 py-2 text-sm ${c.nivel === 2 ? 'pl-10' : 'font-medium'} ${c.activo ? '' : 'opacity-50'}`}>
      <span className="num w-28 truncate text-tenue" title={c.codigo}>{c.codigo}</span>
      {editando ? (
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="campo min-w-0 flex-1 py-1" autoFocus aria-label="Nombre" />
      ) : (
        <span className="min-w-0 flex-1 truncate">{c.nombre}{!c.activo && ' (inactivo)'}</span>
      )}
      {c.nivel === 2 && (
        <select value={c.estado} disabled={!editable || pendiente} onChange={(e) => guardar({ estado: e.target.value })} className="campo w-48 py-1 text-xs" aria-label="Tipo">
          {Object.entries(ESTADOS_CC).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
        </select>
      )}
      {editable && (editando ? (
        <>
          <button type="button" className="text-xs text-acento" disabled={pendiente} onClick={() => guardar({ nombre })}>Guardar</button>
          <button type="button" className="text-xs text-tenue" onClick={() => { setEditando(false); setNombre(c.nombre); }}>Cancelar</button>
        </>
      ) : (
        <>
          <button type="button" className="text-xs text-tenue hover:text-texto" onClick={() => setEditando(true)}>Editar</button>
          <button type="button" className="text-xs text-tenue hover:text-texto" disabled={pendiente} onClick={() => guardar({ activo: !c.activo })}>
            {c.activo ? 'Desactivar' : 'Activar'}
          </button>
        </>
      ))}
      {error && <p className="w-full text-xs text-peligro">{error}</p>}
    </div>
  );
}

export function FormCentro({ empresaId, principales }: { empresaId: string; principales: Centro[] }) {
  const [estado, accion] = useActionState<EstadoForm, FormData>(crearCentro, {});
  const [padre, setPadre] = useState('');
  return (
    <form action={accion} className="tarjeta space-y-3 p-4">
      <h2 className="font-semibold">Nuevo centro de costo</h2>
      <input type="hidden" name="empresaId" value={empresaId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="etiqueta" htmlFor="padre">Depende de</label>
          <select id="padre" name="padre" value={padre} onChange={(e) => setPadre(e.target.value)} className="campo">
            <option value="">— Es un centro principal —</option>
            {principales.filter((p) => p.activo).map((p) => <option key={p.codigo} value={p.codigo}>{p.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="etiqueta" htmlFor="estado">Tipo</label>
          <select id="estado" name="estado" defaultValue="normal" disabled={!padre} className="campo">
            {Object.entries(ESTADOS_CC).slice(0, 3).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </select>
          {!padre && <input type="hidden" name="estado" value="normal" />}
        </div>
        <div>
          <label className="etiqueta" htmlFor="codigo">Código</label>
          <input id="codigo" name="codigo" required className="campo num" placeholder="FES-C3" />
        </div>
        <div>
          <label className="etiqueta" htmlFor="nombre">Nombre</label>
          <input id="nombre" name="nombre" required className="campo" placeholder="Cuartel 3 Cerezos" />
        </div>
      </div>
      <Mensaje error={estado.error} ok={estado.ok} />
      <div className="w-40"><BotonEnviar pendiente="Creando…">Crear</BotonEnviar></div>
    </form>
  );
}
