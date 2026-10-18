'use client';

import { useState, useTransition } from 'react';
import { TIPOS_EVENTO, TIPOS_LICENCIA, type EventoAsistencia, type Asistencia as Asis } from '@/remuneraciones/calculo';
import { fechaCL } from '@/lib/formato';
import { Mensaje } from '@/components/form-estado';
import { guardarEvento, borrarEvento, guardarHoras } from '../acciones';

export function Asistencia({ empresaId, periodo, cerrado, escribe, trabajadores, eventos, resumen }: {
  empresaId: string; periodo: string; cerrado: boolean; escribe: boolean; trabajadores: { id: string; nombre: string }[];
  eventos: EventoAsistencia[]; resumen: { id: string; nombre: string; porHora: boolean; a: Asis }[];
}) {
  const vacio = { trabajador_id: trabajadores[0]?.id ?? '', tipo: 'licencia', lic_tipo: '1', desde: `${periodo}-01`, hasta: `${periodo}-01`, folio: '', obs: '' };
  const [ev, setEv] = useState(vacio);
  const [horas, setHoras] = useState<Record<string, string>>(Object.fromEntries(resumen.filter((r) => r.porHora).map((r) => [r.id, String(r.a.horas ?? '')])));
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pendiente, iniciar] = useTransition();
  const nombre = (id: string) => trabajadores.find((t) => t.id === id)?.nombre ?? '—';
  const run = (f: () => Promise<{ ok: boolean; mensaje?: string; error?: string }>) => iniciar(async () => { const r = await f(); setMsg(r.ok ? { ok: r.mensaje } : { error: r.error }); });
  return (
    <div className="space-y-4">
      {cerrado && <p className="rounded-md border border-aviso/40 bg-aviso/10 px-3 py-2 text-sm text-aviso">El libro de este mes está cerrado: los cambios de asistencia no lo modifican hasta reabrirlo.</p>}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="tarjeta overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-tenue uppercase">
              <tr className="border-b border-borde"><th className="px-3 py-2">Trabajador</th><th className="px-2 py-2 text-right">Pagados</th><th className="px-2 py-2 text-right">Licencia</th>
                <th className="px-2 py-2 text-right">Sin goce</th><th className="px-2 py-2 text-right">Ausencia</th><th className="px-2 py-2 text-right">Vacaciones</th><th className="px-2 py-2 text-right">Fuera contrato</th><th className="px-3 py-2 text-right">Horas</th></tr>
            </thead>
            <tbody>
              {resumen.map((r) => (
                <tr key={r.id} className="border-b border-borde/40">
                  <td className="px-3 py-1.5">{r.nombre}</td>
                  <td className={`num px-2 py-1.5 text-right font-semibold ${r.a.diasPagados < 30 ? 'text-aviso' : ''}`}>{r.a.diasPagados}</td>
                  <td className="num px-2 py-1.5 text-right">{r.a.diasLicencia || ''}</td><td className="num px-2 py-1.5 text-right">{r.a.diasPermisoSin || ''}</td>
                  <td className="num px-2 py-1.5 text-right">{r.a.diasAusencia || ''}</td><td className="num px-2 py-1.5 text-right">{r.a.diasVacaciones || ''}</td>
                  <td className="num px-2 py-1.5 text-right">{r.a.diasFueraContrato || ''}</td>
                  <td className="px-3 py-1 text-right">
                    {r.porHora && (
                      <span className="inline-flex gap-1">
                        <input inputMode="decimal" value={horas[r.id] ?? ''} disabled={!escribe || cerrado} onChange={(e) => setHoras({ ...horas, [r.id]: e.target.value })} className="campo num w-20 py-0.5 text-right" aria-label={`Horas ${r.nombre}`} />
                        {escribe && !cerrado && <button type="button" className="text-acento" onClick={() => run(() => guardarHoras(empresaId, periodo, r.id, Number(String(horas[r.id]).replace(',', '.')) || 0))}>✓</button>}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-[11px] text-tenue">Mes comercial de 30 días: días pagados = 30 − licencias − permisos sin goce − ausencias − días fuera del contrato.</p>
        </div>
        {escribe && (
          <div className="tarjeta space-y-2 p-4 text-sm">
            <h2 className="font-semibold">Registrar evento</h2>
            <select value={ev.trabajador_id} onChange={(e) => setEv({ ...ev, trabajador_id: e.target.value })} className="campo" aria-label="Trabajador">
              {trabajadores.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
            <select value={ev.tipo} onChange={(e) => setEv({ ...ev, tipo: e.target.value })} className="campo" aria-label="Tipo">
              {TIPOS_EVENTO.map((t) => <option key={t.k} value={t.k}>{t.nm}</option>)}
            </select>
            {ev.tipo === 'licencia' && (
              <select value={ev.lic_tipo} onChange={(e) => setEv({ ...ev, lic_tipo: e.target.value })} className="campo" aria-label="Tipo de licencia">
                {TIPOS_LICENCIA.map((t) => <option key={t.k} value={t.k}>{t.nm}</option>)}
              </select>
            )}
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={ev.desde} onChange={(e) => setEv({ ...ev, desde: e.target.value, hasta: ev.hasta < e.target.value ? e.target.value : ev.hasta })} className="campo" aria-label="Desde" />
              <input type="date" value={ev.hasta} onChange={(e) => setEv({ ...ev, hasta: e.target.value })} className="campo" aria-label="Hasta" />
            </div>
            <input value={ev.folio} onChange={(e) => setEv({ ...ev, folio: e.target.value })} placeholder="Folio licencia (opcional)" className="campo" />
            <input value={ev.obs} onChange={(e) => setEv({ ...ev, obs: e.target.value })} placeholder="Observación (opcional)" className="campo" />
            <button type="button" className="boton w-full" disabled={pendiente || !ev.trabajador_id} onClick={() => run(() => guardarEvento(empresaId, ev))}>Guardar evento</button>
          </div>
        )}
      </div>
      <div className="tarjeta overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-tenue uppercase"><tr className="border-b border-borde"><th className="px-3 py-2">Trabajador</th><th className="px-2 py-2">Evento</th><th className="px-2 py-2">Desde</th><th className="px-2 py-2">Hasta</th><th className="px-2 py-2">Folio</th><th className="px-3 py-2" /></tr></thead>
          <tbody>
            {eventos.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-tenue">Sin eventos en el mes: todos con 30 días pagados.</td></tr>}
            {eventos.map((e) => (
              <tr key={e.id} className="border-b border-borde/40">
                <td className="px-3 py-1.5">{nombre(e.trab)}</td>
                <td className="px-2 py-1.5">{TIPOS_EVENTO.find((t) => t.k === e.tipo)?.nm}{e.licTipo ? ` · ${TIPOS_LICENCIA.find((t) => t.k === e.licTipo)?.nm.split(' · ')[0]}` : ''}</td>
                <td className="num px-2 py-1.5">{fechaCL(e.desde)}</td><td className="num px-2 py-1.5">{fechaCL(e.hasta ?? e.desde)}</td><td className="px-2 py-1.5">{e.folio}</td>
                <td className="px-3 py-1.5 text-right">{escribe && <button type="button" className="text-tenue hover:text-peligro" onClick={() => run(() => borrarEvento(empresaId, e.id!))}>Eliminar</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Mensaje {...msg} />
    </div>
  );
}
