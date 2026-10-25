'use client';

import { useActionState, useState, useTransition } from 'react';
import { agregarUsuario, actualizarMiembro, quitarInvitacion } from './acciones';
import type { EstadoForm } from '../../../../(auth)/acciones';
import { BotonEnviar, Mensaje } from '@/components/form-estado';
import { NOMBRE_ROL } from '@/lib/formato';

export interface Miembro {
  usuario_id: string; rol: 'admin' | 'contador' | 'consulta'; estado: string; creado: string;
  perfiles: { nombre: string | null; email: string | null; es_administrador?: boolean; perfiles_acceso?: { nombre: string; tipo: string } | null } | null;
}

/** Roles que se pueden asignar: sólo el administrador del sistema nombra dueños. */
const roles = (admin: boolean) => Object.entries(NOMBRE_ROL).filter(([v]) => admin || v !== 'admin');

export function FilaMiembro({ empresaId, m, soyYo, admin }: { empresaId: string; m: Miembro; soyYo: boolean; admin: boolean }) {
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
        <div className="truncate text-xs text-tenue">{m.perfiles?.email}{inactivo ? ' · desactivado' : ''}
          {' · '}{m.perfiles?.es_administrador ? '🛡️ Administrador del sistema' : m.perfiles?.perfiles_acceso ? `perfil ${m.perfiles.perfiles_acceso.nombre}` : 'sin perfil asignado'}</div>
      </div>
      <select value={m.rol} disabled={pendiente || (m.rol === 'admin' && !admin)} onChange={(e) => cambiar({ rol: e.target.value })} className="campo w-44 py-1" aria-label="Rol">
        {(m.rol === 'admin' && !admin ? Object.entries(NOMBRE_ROL) : roles(admin)).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
      </select>
      <button type="button" disabled={pendiente} onClick={() => cambiar({ estado: inactivo ? 'activo' : 'inactivo' })}
        className={`text-xs ${inactivo ? 'text-acento' : 'text-tenue hover:text-peligro'}`}>
        {inactivo ? 'Reactivar' : 'Desactivar'}
      </button>
      {error && <p className="w-full text-xs text-peligro">{error}</p>}
    </div>
  );
}

export function FormAgregar({ empresaId, admin }: { empresaId: string; admin: boolean }) {
  const [estado, accion] = useActionState<EstadoForm, FormData>(agregarUsuario, {});
  return (
    <form action={accion} className="tarjeta space-y-3 p-4">
      <h2 className="font-semibold">Agregar usuario</h2>
      <p className="text-xs text-tenue">Si la persona ya tiene cuenta, entra de inmediato. Si no, queda invitada: entra al crear su cuenta con ese correo, o se la puedes crear ahora. Trabajará con los permisos de su perfil de acceso.</p>
      <input type="hidden" name="empresaId" value={empresaId} />
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_180px]">
        <input name="email" type="email" required placeholder="correo@ejemplo.cl" className="campo" aria-label="Correo" />
        <input name="nombre" placeholder="Nombre (si es nuevo)" className="campo" aria-label="Nombre" />
        <select name="rol" defaultValue="contador" className="campo" aria-label="Rol">
          {roles(admin).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
        </select>
      </div>
      <label className="flex items-start gap-2 text-xs"><input type="checkbox" name="crear" value="1" className="mt-0.5" />
        <span>Si no tiene cuenta, crearla ahora con una contraseña temporal (te la muestro para que se la entregues).</span></label>
      <Mensaje error={estado.error} ok={estado.ok} />
      <div className="w-40"><BotonEnviar pendiente="Agregando…">Agregar</BotonEnviar></div>
    </form>
  );
}

export function Invitaciones({ empresaId, lista }: { empresaId: string; lista: { id: string; email: string; rol: string | null; creado: string }[] }) {
  const [error, setError] = useState('');
  const [pendiente, iniciar] = useTransition();
  if (!lista.length) return null;
  return (
    <div className="tarjeta space-y-1 p-4 text-sm">
      <h2 className="font-semibold">Invitados sin cuenta todavía</h2>
      {lista.map((i) => (
        <div key={i.id} className="flex flex-wrap items-center gap-2 border-b border-borde/40 py-1 text-xs">
          <span className="font-medium">{i.email}</span>
          <span className="text-tenue">{NOMBRE_ROL[(i.rol ?? 'contador') as keyof typeof NOMBRE_ROL]} · desde {new Date(i.creado).toLocaleDateString('es-CL')}</span>
          <button type="button" className="ml-auto text-tenue hover:text-peligro" disabled={pendiente}
            onClick={() => iniciar(async () => { const r = await quitarInvitacion(empresaId, i.id); setError(r.error ?? ''); })}>Quitar</button>
        </div>
      ))}
      {error && <p className="text-xs text-peligro">{error}</p>}
    </div>
  );
}
