'use client';

import { useActionState, useState, useTransition } from 'react';
import { agregarUsuario, actualizarMiembro } from './acciones';
import type { EstadoForm } from '../../../../(auth)/acciones';
import { BotonEnviar, Mensaje } from '@/components/form-estado';
import { NOMBRE_ROL } from '@/lib/formato';

export interface Miembro {
  usuario_id: string; rol: 'admin' | 'contador' | 'consulta'; estado: string; creado: string;
  perfiles: { nombre: string | null; email: string | null } | null;
}

export function FilaMiembro({ empresaId, m, soyYo }: { empresaId: string; m: Miembro; soyYo: boolean }) {
  const [error, setError] = useState('');
  const [pendiente, iniciar] = useTransition();
  const cambiar = (c: { rol?: string; estado?: string }) => iniciar(async () => {
    const r = await actualizarMiembro(empresaId, m.usuario_id, c);
    setError(r.error ?? '');
  });
  const inactivo = m.estado !== 'activo';
  return (
    <div className={`flex flex-wrap items-center gap-3 px-4 py-3 ${inactivo ? 'opacity-60' : ''}`}>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{m.perfiles?.nombre || m.perfiles?.email} {soyYo && <span className="text-xs text-tenue">(tú)</span>}</div>
        <div className="truncate text-xs text-tenue">{m.perfiles?.email}{inactivo ? ' · desactivado' : ''}</div>
      </div>
      <select value={m.rol} disabled={pendiente} onChange={(e) => cambiar({ rol: e.target.value })} className="campo w-44 py-1" aria-label="Rol">
        {Object.entries(NOMBRE_ROL).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
      </select>
      <button type="button" disabled={pendiente} onClick={() => cambiar({ estado: inactivo ? 'activo' : 'inactivo' })}
        className={`text-xs ${inactivo ? 'text-acento' : 'text-tenue hover:text-peligro'}`}>
        {inactivo ? 'Reactivar' : 'Desactivar'}
      </button>
      {error && <p className="w-full text-xs text-peligro">{error}</p>}
    </div>
  );
}

export function FormAgregar({ empresaId }: { empresaId: string }) {
  const [estado, accion] = useActionState<EstadoForm, FormData>(agregarUsuario, {});
  return (
    <form action={accion} className="tarjeta space-y-3 p-4">
      <h2 className="font-semibold">Agregar usuario</h2>
      <p className="text-xs text-tenue">La persona debe haber creado su cuenta antes, con el mismo correo.</p>
      <input type="hidden" name="empresaId" value={empresaId} />
      <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
        <input name="email" type="email" required placeholder="correo@ejemplo.cl" className="campo" aria-label="Correo" />
        <select name="rol" defaultValue="contador" className="campo" aria-label="Rol">
          {Object.entries(NOMBRE_ROL).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
        </select>
      </div>
      <Mensaje error={estado.error} ok={estado.ok} />
      <div className="w-40"><BotonEnviar pendiente="Agregando…">Agregar</BotonEnviar></div>
    </form>
  );
}
