'use client';

import { useActionState, useState, useTransition } from 'react';
import { crearCuenta, actualizarCuenta, type CambiosCuenta } from './acciones';
import type { EstadoForm } from '../../../../(auth)/acciones';
import { BotonEnviar, Mensaje } from '@/components/form-estado';

export interface Cuenta {
  codigo: string; nombre: string; tipo: string; naturaleza: string | null; acepta_movimientos: boolean;
  tipo_auxiliar: string | null; acepta_centro_costo: boolean; requiere_centro_costo: boolean; activa: boolean;
}

export const TIPO: Record<string, string> = { T: 'Título', S: 'Subtítulo', A: 'Activo', P: 'Pasivo', C: 'Gasto/Costo', I: 'Ingreso' };
const AUX = ['', 'cliente', 'proveedor', 'honorario', 'trabajador'];

export function FilaCuenta({ empresaId, c, editable }: { empresaId: string; c: Cuenta; editable: boolean }) {
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState({ nombre: c.nombre, tipo_auxiliar: c.tipo_auxiliar ?? '', acepta_centro_costo: c.acepta_centro_costo, requiere_centro_costo: c.requiere_centro_costo, activa: c.activa });
  const [error, setError] = useState('');
  const [pendiente, iniciar] = useTransition();
  const agrupa = !c.acepta_movimientos;
  const guardar = (cambios: CambiosCuenta) => iniciar(async () => {
    const r = await actualizarCuenta(empresaId, c.codigo, cambios);
    setError(r.error ?? '');
    if (!r.error) setEditando(false);
  });

  if (editando) {
    return (
      <tr className="border-b border-borde/50 bg-panel-2">
        <td className="num px-3 py-1.5">{c.codigo}</td>
        <td className="px-3 py-1.5" colSpan={2}>
          <input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} className="campo py-1" aria-label="Nombre" />
          {error && <div className="mt-1 text-xs text-peligro">{error}</div>}
        </td>
        <td className="px-3 py-1.5">
          {!agrupa && (
            <select value={f.tipo_auxiliar} onChange={(e) => setF({ ...f, tipo_auxiliar: e.target.value })} className="campo py-1 text-xs" aria-label="Auxiliar">
              {AUX.map((a) => <option key={a} value={a}>{a || 'Sin auxiliar'}</option>)}
            </select>
          )}
        </td>
        <td className="px-3 py-1.5 text-xs">
          {!agrupa && (
            <div className="space-y-0.5">
              <label className="flex items-center gap-1"><input type="checkbox" checked={f.acepta_centro_costo} onChange={(e) => setF({ ...f, acepta_centro_costo: e.target.checked, requiere_centro_costo: e.target.checked && f.requiere_centro_costo })} /> Admite</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={f.requiere_centro_costo} onChange={(e) => setF({ ...f, requiere_centro_costo: e.target.checked, acepta_centro_costo: e.target.checked || f.acepta_centro_costo })} /> Exige</label>
            </div>
          )}
        </td>
        <td className="space-x-2 px-3 py-1.5 text-xs whitespace-nowrap">
          <label className="mr-2"><input type="checkbox" checked={f.activa} onChange={(e) => setF({ ...f, activa: e.target.checked })} /> Activa</label>
          <button type="button" disabled={pendiente} className="text-acento" onClick={() => guardar(f)}>Guardar</button>
          <button type="button" className="text-tenue" onClick={() => setEditando(false)}>Cancelar</button>
        </td>
      </tr>
    );
  }
  return (
    <tr className={`border-b border-borde/50 ${agrupa ? 'bg-panel-2 font-semibold' : ''} ${c.activa ? '' : 'opacity-50'}`}>
      <td className="num px-3 py-1.5">{c.codigo}</td>
      <td className="px-3 py-1.5">{c.nombre}{!c.activa && ' (inactiva)'}</td>
      <td className="px-3 py-1.5 text-tenue">{TIPO[c.tipo] ?? c.tipo}{c.naturaleza ? ` · ${c.naturaleza}` : ''}</td>
      <td className="px-3 py-1.5 text-tenue">{c.tipo_auxiliar ?? ''}</td>
      <td className="px-3 py-1.5 text-tenue">{c.requiere_centro_costo ? 'Exige' : c.acepta_centro_costo ? 'Admite' : ''}</td>
      <td className="px-3 py-1.5 text-right">
        {editable && <button type="button" className="text-xs text-tenue hover:text-texto" onClick={() => setEditando(true)}>Editar</button>}
      </td>
    </tr>
  );
}

export function FormCuenta({ empresaId }: { empresaId: string }) {
  const [estado, accion] = useActionState<EstadoForm, FormData>(crearCuenta, {});
  return (
    <details className="tarjeta p-4">
      <summary className="cursor-pointer font-semibold">+ Nueva cuenta</summary>
      <form action={accion} className="mt-3 space-y-3">
        <input type="hidden" name="empresaId" value={empresaId} />
        <div className="grid gap-3 sm:grid-cols-[140px_1fr_160px_120px]">
          <input name="codigo" required inputMode="numeric" placeholder="Código" className="campo num" aria-label="Código" />
          <input name="nombre" required placeholder="Nombre" className="campo" aria-label="Nombre" />
          <select name="tipo" defaultValue="C" className="campo" aria-label="Tipo">
            {Object.entries(TIPO).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </select>
          <select name="naturaleza" defaultValue="" className="campo" aria-label="Naturaleza">
            <option value="">Naturaleza</option><option value="D">Deudora</option><option value="C">Acreedora</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <select name="tipo_auxiliar" defaultValue="" className="campo w-44" aria-label="Auxiliar">
            {AUX.map((a) => <option key={a} value={a}>{a ? `Auxiliar: ${a}` : 'Sin auxiliar'}</option>)}
          </select>
          <label className="flex items-center gap-1"><input type="checkbox" name="acepta_centro_costo" /> Admite centro de costo</label>
        </div>
        <Mensaje error={estado.error} ok={estado.ok} />
        <div className="w-40"><BotonEnviar pendiente="Creando…">Crear cuenta</BotonEnviar></div>
      </form>
    </details>
  );
}
