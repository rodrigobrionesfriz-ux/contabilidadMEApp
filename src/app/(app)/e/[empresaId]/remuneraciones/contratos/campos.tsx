'use client';
// Selectores compartidos de los formularios de contratos
import { DT_COMUNAS, DT_NACIONALIDADES } from '@/remuneraciones/contratos-dt-tablas';
import { DIAS, type Horario } from '@/remuneraciones/contrato-dt';

const COMUNAS = [...DT_COMUNAS].sort((a, b) => a.nm.localeCompare(b.nm, 'es'));
export function SelComuna({ id, value, onChange, disabled }: { id: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="campo">
      <option value="">Seleccionar…</option>
      {COMUNAS.map((c) => <option key={c.cd} value={String(c.cd)}>{c.nm} ({c.cd})</option>)}
    </select>
  );
}
export function SelNacionalidad({ id, value, onChange, disabled }: { id: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="campo">
      <option value="">Seleccionar…</option>
      {DT_NACIONALIDADES.map((c) => <option key={c.cd} value={String(c.cd)}>{c.nm} ({c.cd})</option>)}
    </select>
  );
}
export function SelLista({ id, value, onChange, lista, disabled }: { id: string; value: number | string; onChange: (v: number) => void; lista: [number, string][]; disabled?: boolean }) {
  return (
    <select id={id} value={String(value)} disabled={disabled} onChange={(e) => onChange(+e.target.value)} className="campo">
      {lista.map(([v, nm]) => <option key={v} value={v}>{v} · {nm}</option>)}
    </select>
  );
}
export function EditorHorario({ prefijo, horario, onChange, disabled }: { prefijo: string; horario: Horario; onChange: (h: Horario) => void; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-7">
      {DIAS.map(([k, , nm]) => {
        const h = horario[k] || ['', ''];
        return (
          <div key={k}>
            <p className="etiqueta">{nm}</p>
            <input type="time" aria-label={`${nm} inicio`} id={`${prefijo}-${k}-i`} disabled={disabled} value={h[0] || ''} onChange={(e) => onChange({ ...horario, [k]: [e.target.value, h[1] || ''] })} className="campo py-1" />
            <input type="time" aria-label={`${nm} término`} id={`${prefijo}-${k}-f`} disabled={disabled} value={h[1] || ''} onChange={(e) => onChange({ ...horario, [k]: [h[0] || '', e.target.value] })} className="campo mt-1 py-1" />
          </div>
        );
      })}
    </div>
  );
}
