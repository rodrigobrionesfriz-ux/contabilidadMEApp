'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { MODULOS, NOMBRE_PERMISO, type Permiso } from '@/lib/modulos';
import { Mensaje } from '@/components/form-estado';
import { guardarPerfil, eliminarPerfil, asignarPerfil, perfilUsuariosNuevos, agregarUsuarioSistema, quitarInvitacion } from './acciones';

export interface PerfilAcceso { id: string; nombre: string; tipo: 'senior' | 'contador'; permisos: Record<string, string> }
export interface Invitacion { id: string; email: string; perfil_acceso: string | null; rol: string | null; creado: string; empresas: { razon_social: string } | null }
export interface UsuarioSistema { id: string; nombre: string | null; email: string | null; es_administrador: boolean; perfil_acceso: string | null; empresas: number; creado: string }

const PERMISOS: Permiso[] = ['editar', 'ver', 'no'];
const COLOR: Record<Permiso, string> = { editar: 'bg-acento/15 text-acento border-acento/40', ver: 'bg-info/10 text-info border-info/40', no: 'bg-panel-2 text-tenue border-borde' };
const TIPO = { senior: '⭐ Senior', contador: '📝 Contador' };

export function EditorPerfiles({ yo, perfiles, usuarios, perfilNuevo, invitaciones }: { yo: string; perfiles: PerfilAcceso[]; usuarios: UsuarioSistema[]; perfilNuevo: string | null; invitaciones: Invitacion[] }) {
  const router = useRouter();
  const [ed, setEd] = useState<PerfilAcceso | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pendiente, iniciar] = useTransition();
  const run = (f: () => Promise<{ ok: true; mensaje: string } | { ok: false; error: string }>, despues?: () => void) => iniciar(async () => {
    const r = await f(); setMsg(r.ok ? { ok: r.mensaje } : { error: r.error }); if (r.ok) { despues?.(); router.refresh(); }
  });
  const editar = (p: PerfilAcceso) => { setEd(p); setTimeout(() => document.getElementById('pf-editor')?.scrollIntoView({ behavior: 'smooth' }), 50); };
  const [nu, setNu] = useState({ email: '', nombre: '', perfil: perfiles.find((p) => p.tipo === 'senior')?.id ?? '', crear: true });
  const usuariosDe = (id: string) => usuarios.filter((u) => u.perfil_acceso === id).length;
  const nuevo = () => {
    const base = perfiles.find((p) => p.tipo === 'contador');
    editar({ id: '', nombre: '', tipo: 'contador', permisos: { ...(base?.permisos ?? {}) } });
  };

  return (
    <div className="space-y-6">
      <Mensaje {...msg} />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Perfiles de acceso</h2>
          <button type="button" className="boton-sec" onClick={nuevo}>+ Nuevo perfil</button>
        </div>
        <div className="tarjeta overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead className="text-left text-tenue">
              <tr className="border-b border-borde">
                <th className="px-3 py-2 uppercase">Módulo</th>
                {perfiles.map((p) => (
                  <th key={p.id} className="px-2 py-2 text-center">
                    <div className="text-sm font-semibold text-texto">{p.nombre}</div>
                    <div>{TIPO[p.tipo]} · {usuariosDe(p.id)} usuario{usuariosDe(p.id) === 1 ? '' : 's'}{perfilNuevo === p.id ? ' · nuevos' : ''}</div>
                    <button type="button" className="mt-1 text-acento hover:underline" onClick={() => editar({ ...p, permisos: { ...p.permisos } })}>Editar</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-borde/40">
                <td className="px-3 py-1.5 font-medium">Crear empresas y autorizar usuarios en ellas</td>
                {perfiles.map((p) => <td key={p.id} className="px-2 py-1.5 text-center">{p.tipo === 'senior' ? '✓' : '–'}</td>)}
              </tr>
              {MODULOS.map((m) => (
                <tr key={m.k} className="border-b border-borde/40">
                  <td className="px-3 py-1.5"><div className="font-medium">{m.nombre}</div><div className="text-[10px] text-tenue">{m.descripcion}</div></td>
                  {perfiles.map((p) => {
                    const v = (PERMISOS.includes(p.permisos[m.k] as Permiso) ? p.permisos[m.k] : 'no') as Permiso;
                    return <td key={p.id} className="px-2 py-1.5 text-center"><span className={`rounded border px-1.5 py-0.5 ${COLOR[v]}`}>{NOMBRE_PERMISO[v]}</span></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {ed && (
        <section id="pf-editor" className="tarjeta scroll-mt-4 space-y-3 p-4 text-sm">
          <h2 className="font-semibold">{ed.id ? `Editar perfil «${ed.nombre}»` : 'Nuevo perfil'}</h2>
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <div><label className="etiqueta" htmlFor="pf-nombre">Nombre</label>
              <input id="pf-nombre" value={ed.nombre} onChange={(e) => setEd({ ...ed, nombre: e.target.value })} className="campo" placeholder="Ej.: Contador externo" /></div>
            <div><label className="etiqueta" htmlFor="pf-tipo">Tipo</label>
              <select id="pf-tipo" value={ed.tipo} onChange={(e) => setEd({ ...ed, tipo: e.target.value as PerfilAcceso['tipo'] })} className="campo">
                <option value="senior">⭐ Senior: crea empresas y autoriza usuarios</option>
                <option value="contador">📝 Contador: sólo empresas asignadas</option>
              </select></div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="text-tenue">Todos:</span>
            {PERMISOS.map((v) => <button key={v} type="button" className="boton-sec py-0.5 text-xs" onClick={() => setEd({ ...ed, permisos: Object.fromEntries(MODULOS.map((m) => [m.k, v])) })}>{NOMBRE_PERMISO[v]}</button>)}
          </div>
          <div className="grid gap-x-6 gap-y-2 md:grid-cols-2">
            {MODULOS.map((m) => {
              const v = (PERMISOS.includes(ed.permisos[m.k] as Permiso) ? ed.permisos[m.k] : 'no') as Permiso;
              return (
                <div key={m.k} className="flex items-center justify-between gap-3 border-b border-borde/40 py-1.5">
                  <div className="min-w-0"><div className="font-medium">{m.nombre}</div><div className="truncate text-[10px] text-tenue" title={m.descripcion}>{m.descripcion}</div></div>
                  <div className="flex shrink-0 overflow-hidden rounded-md border border-borde text-xs" role="radiogroup" aria-label={m.nombre}>
                    {PERMISOS.map((p) => (
                      <button key={p} type="button" role="radio" aria-checked={v === p} onClick={() => setEd({ ...ed, permisos: { ...ed.permisos, [m.k]: p } })}
                        className={`px-2 py-1 ${v === p ? COLOR[p] + ' font-semibold' : 'text-tenue hover:bg-panel-2'}`}>{NOMBRE_PERMISO[p]}</button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="boton" disabled={pendiente} onClick={() => run(() => guardarPerfil(ed.id || null, ed.nombre, ed.tipo, ed.permisos), () => setEd(null))}>Guardar perfil</button>
            <button type="button" className="boton-sec" onClick={() => setEd(null)}>Cancelar</button>
            {ed.id && <button type="button" className="ml-auto text-xs text-tenue hover:text-peligro" disabled={pendiente}
              onClick={() => confirm(`¿Eliminar el perfil «${ed.nombre}»?`) && run(() => eliminarPerfil(ed.id), () => setEd(null))}>Eliminar perfil</button>}
          </div>
        </section>
      )}

      <section className="tarjeta space-y-3 p-4 text-sm">
        <h2 className="font-semibold">Agregar usuario</h2>
        <p className="text-xs text-tenue">Para un usuario Senior no hace falta empresa: con su perfil entra, crea sus empresas y autoriza a sus contadores.</p>
        <div className="grid gap-3 md:grid-cols-[2fr_2fr_1.5fr]">
          <div><label className="etiqueta" htmlFor="nu-email">Correo *</label>
            <input id="nu-email" type="email" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} className="campo" placeholder="correo@ejemplo.cl" /></div>
          <div><label className="etiqueta" htmlFor="nu-nombre">Nombre</label>
            <input id="nu-nombre" value={nu.nombre} onChange={(e) => setNu({ ...nu, nombre: e.target.value })} className="campo" /></div>
          <div><label className="etiqueta" htmlFor="nu-perfil">Perfil *</label>
            <select id="nu-perfil" value={nu.perfil} onChange={(e) => setNu({ ...nu, perfil: e.target.value })} className="campo">
              {perfiles.map((p) => <option key={p.id} value={p.id}>{p.nombre} ({p.tipo === 'senior' ? 'Senior' : 'Contador'})</option>)}
            </select></div>
        </div>
        <label className="flex items-start gap-2 text-xs">
          <input type="checkbox" checked={nu.crear} onChange={(e) => setNu({ ...nu, crear: e.target.checked })} className="mt-0.5" />
          <span>Crear la cuenta ahora con una contraseña temporal (te la muestro para que se la entregues; le llegará un correo para confirmarla).
            Sin marcar: la persona se registra sola en la pantalla de Registro con este correo y recibe el perfil.</span>
        </label>
        <button type="button" className="boton" disabled={pendiente || !nu.email.trim() || !nu.perfil}
          onClick={() => run(() => agregarUsuarioSistema(nu.email, nu.nombre, nu.perfil, nu.crear), () => setNu({ ...nu, email: '', nombre: '' }))}>Agregar usuario</button>
        {invitaciones.length > 0 && (
          <div className="space-y-1 pt-2">
            <div className="etiqueta">Invitaciones pendientes (aún sin cuenta)</div>
            {invitaciones.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center gap-2 border-b border-borde/40 py-1 text-xs">
                <span className="font-medium">{i.email}</span>
                <span className="text-tenue">{i.empresas ? `→ ${i.empresas.razon_social} (${i.rol === 'consulta' ? 'sólo consulta' : i.rol === 'admin' ? 'dueño' : 'trabaja'})` : `perfil ${perfiles.find((p) => p.id === i.perfil_acceso)?.nombre ?? '(de usuarios nuevos)'}`}</span>
                <button type="button" className="ml-auto text-tenue hover:text-peligro" disabled={pendiente} onClick={() => run(() => quitarInvitacion(i.id))}>Quitar</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="font-semibold">Usuarios del sistema</h2>
          <div className="flex items-center gap-2 text-xs">
            <label htmlFor="pf-nuevos" className="text-tenue">Perfil de quien se registra:</label>
            <select id="pf-nuevos" value={perfilNuevo ?? ''} className="campo w-auto py-1 text-xs" disabled={pendiente}
              onChange={(e) => run(() => perfilUsuariosNuevos(e.target.value || null))}>
              <option value="">Sin perfil (no ve nada hasta que se lo asignes)</option>
              {perfiles.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
        </div>
        <div className="tarjeta overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-tenue uppercase">
              <tr className="border-b border-borde"><th className="px-3 py-2">Usuario</th><th className="px-2 py-2">Perfil</th><th className="px-2 py-2 text-center">Administrador</th><th className="px-2 py-2 text-right">Empresas</th></tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className="border-b border-borde/40">
                  <td className="px-3 py-1.5"><div className="font-medium">{u.nombre || u.email}{u.id === yo ? ' (tú)' : ''}</div><div className="text-xs text-tenue">{u.email}</div></td>
                  <td className="px-2 py-1.5">
                    <select aria-label={`Perfil de ${u.email}`} value={u.perfil_acceso ?? ''} disabled={pendiente || u.es_administrador} className="campo py-1 text-sm"
                      title={u.es_administrador ? 'El administrador tiene todos los permisos' : ''}
                      onChange={(e) => run(() => asignarPerfil(u.id, e.target.value || null, u.es_administrador))}>
                      <option value="">Sin perfil</option>
                      {perfiles.map((p) => <option key={p.id} value={p.id}>{p.nombre} ({p.tipo === 'senior' ? 'Senior' : 'Contador'})</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <input type="checkbox" aria-label={`Administrador: ${u.email}`} checked={u.es_administrador} disabled={pendiente}
                      onChange={(e) => (!e.target.checked && u.id === yo ? confirm('¿Quitarte el rol de administrador? Dejarás de ver esta página.') : true)
                        && run(() => asignarPerfil(u.id, u.perfil_acceso, e.target.checked))} />
                  </td>
                  <td className="num px-2 py-1.5 text-right">{u.empresas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-tenue">El dueño de cada empresa (o tú) autoriza a los usuarios en Configuración → Usuarios de esa empresa.</p>
      </section>
    </div>
  );
}
