'use client';

import { useState, useTransition } from 'react';
import { TIPOS_JORNADA, FORMAS_PAGO, ANTICIPOS, TURNOS_DT, horasSemana, type Defaults } from '@/remuneraciones/contrato-dt';
import { Mensaje } from '@/components/form-estado';
import { guardarDefaultsContrato } from './acciones';
import { SelComuna, SelLista, EditorHorario } from './campos';

/** Valores por defecto de la empresa: se usan en todo contrato que no los defina. */
export function DefaultsForm({ empresaId, D, escribe }: { empresaId: string; D: Defaults; escribe: boolean }) {
  const [d, setD] = useState({ ...D, colacion: String(D.colacion), duracion: String(D.duracion), diaPago: String(D.diaPago) });
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pendiente, iniciar] = useTransition();
  const hs = horasSemana({ horario: d.horario, colacion: +d.colacion, colacionImputable: d.colacionImputable });
  return (
    <details className="tarjeta p-4 text-sm">
      <summary className="cursor-pointer font-semibold">⚙️ Valores por defecto de la empresa</summary>
      <p className="mt-1 text-xs text-tenue">Comuna de celebración, jornada, horario y pago que se usan en los contratos que no los definen.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <div><label className="etiqueta" htmlFor="d-celeb">Comuna de celebración</label><SelComuna id="d-celeb" value={d.comunaCelebracion} onChange={(v) => setD({ ...d, comunaCelebracion: v })} disabled={!escribe} /></div>
        <div><label className="etiqueta" htmlFor="d-zona">Comuna de prestación de servicios</label><SelComuna id="d-zona" value={d.zona1} onChange={(v) => setD({ ...d, zona1: v })} disabled={!escribe} /></div>
        <div><label className="etiqueta" htmlFor="d-tj">Tipo de jornada</label><SelLista id="d-tj" value={d.tipoJornada} lista={TIPOS_JORNADA} onChange={(v) => setD({ ...d, tipoJornada: v })} disabled={!escribe} /></div>
        <div><label className="etiqueta" htmlFor="d-dur">Duración (h semanales)</label><input id="d-dur" inputMode="numeric" value={d.duracion} disabled={!escribe} onChange={(e) => setD({ ...d, duracion: e.target.value })} className="campo num" /></div>
        <div><label className="etiqueta" htmlFor="d-turno">Turnos</label><SelLista id="d-turno" value={d.turnos} lista={TURNOS_DT} onChange={(v) => setD({ ...d, turnos: v })} disabled={!escribe} /></div>
        <div><label className="etiqueta" htmlFor="d-col">Colación (min)</label><input id="d-col" inputMode="numeric" value={d.colacion} disabled={!escribe} onChange={(e) => setD({ ...d, colacion: e.target.value })} className="campo num" /></div>
        <div><label className="etiqueta" htmlFor="d-colimp">La colación</label><select id="d-colimp" value={d.colacionImputable ? '1' : '0'} disabled={!escribe} onChange={(e) => setD({ ...d, colacionImputable: e.target.value === '1' })} className="campo"><option value="0">No se imputa a la jornada</option><option value="1">Se imputa a la jornada</option></select></div>
        <div><label className="etiqueta" htmlFor="d-dia">Día de pago</label><input id="d-dia" inputMode="numeric" value={d.diaPago} disabled={!escribe} onChange={(e) => setD({ ...d, diaPago: e.target.value })} className="campo num" /></div>
        <div><label className="etiqueta" htmlFor="d-forma">Forma de pago</label><SelLista id="d-forma" value={d.formaPago} lista={FORMAS_PAGO} onChange={(v) => setD({ ...d, formaPago: v })} disabled={!escribe} /></div>
        <div><label className="etiqueta" htmlFor="d-ant">Anticipo</label><SelLista id="d-ant" value={d.anticipo} lista={ANTICIPOS} onChange={(v) => setD({ ...d, anticipo: v })} disabled={!escribe} /></div>
      </div>
      <p className="etiqueta mt-3">Horario</p>
      <EditorHorario prefijo="d" horario={d.horario} onChange={(h) => setD({ ...d, horario: h })} disabled={!escribe} />
      <p className="mt-1 text-xs text-tenue">Suma {String(hs.horas).replace('.', ',')} h semanales en {hs.dias} día(s).</p>
      {escribe && <button type="button" className="boton-sec mt-3" disabled={pendiente} onClick={() => iniciar(async () => {
        const r = await guardarDefaultsContrato(empresaId, { ...d, colacion: +d.colacion || 0, duracion: +d.duracion || 42, diaPago: +d.diaPago || 30 });
        setMsg(r.ok ? { ok: r.mensaje } : { error: r.error });
      })}>Guardar valores por defecto</button>}
      <Mensaje {...msg} />
    </details>
  );
}
