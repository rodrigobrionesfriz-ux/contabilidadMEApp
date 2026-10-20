'use client';

import { useState, useTransition } from 'react';
import { decimalCL, MESES } from '@/lib/formato';
import { useRouter } from 'next/navigation';
import { Mensaje } from '@/components/form-estado';
import { cerrarLibro, reabrirLibro, guardarIndicador, actualizarIndicadoresAPI } from '../acciones';

const fmtUF = (n: number) => n.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function AccionesLibro({ empresaId, anio, mes, uf, utm, ufTabla, cerrado, escribe, admin, hayLineas }: {
  empresaId: string; anio: number; mes: number; uf: number; utm: number; ufTabla: boolean; cerrado: boolean; escribe: boolean; admin: boolean; hayLineas: boolean;
}) {
  const router = useRouter();
  const [editar, setEditar] = useState(!ufTabla && !cerrado && escribe);
  const [v, setV] = useState({ uf: ufTabla ? fmtUF(uf) : '', utm: utm ? utm.toLocaleString('es-CL') : '' });
  const firma = `${uf}|${utm}|${ufTabla}`;
  const [firmaVista, setFirmaVista] = useState(firma);
  if (firma !== firmaVista) { setFirmaVista(firma); setV({ uf: ufTabla ? fmtUF(uf) : '', utm: utm ? utm.toLocaleString('es-CL') : '' }); }
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pendiente, iniciar] = useTransition();
  const periodo = `${anio}-${String(mes).padStart(2, '0')}`;
  const ultimoDia = new Date(anio, mes, 0).getDate();
  const guardar = () => iniciar(async () => {
    const r = await guardarIndicador(empresaId, periodo, decimalCL(v.uf), v.utm.trim() ? decimalCL(v.utm) : null);
    setMsg(r.ok ? { ok: r.mensaje } : { error: r.error });
    if (r.ok) { setEditar(false); router.refresh(); }
  });
  return (
    <div className="tarjeta space-y-2 p-3 text-sm">
      <div className="flex flex-wrap items-end gap-3">
        {editar ? (<>
          <div><label className="etiqueta" htmlFor="uf">UF al {ultimoDia} de {MESES[mes - 1].toLowerCase()}</label>
            <input id="uf" autoFocus value={v.uf} onChange={(e) => setV({ ...v, uf: e.target.value })} className="campo num w-36 text-right" /></div>
          <div><label className="etiqueta" htmlFor="utm">UTM del mes</label>
            <input id="utm" value={v.utm} onChange={(e) => setV({ ...v, utm: e.target.value })} className="campo num w-32 text-right" /></div>
          <button type="button" className="boton" disabled={pendiente || !v.uf.trim()} onClick={guardar}>Guardar y recalcular</button>
          {ufTabla && <button type="button" className="boton-sec" onClick={() => setEditar(false)}>Cancelar</button>}
        </>) : (<>
          <div><div className="etiqueta">UF {cerrado ? 'del libro' : `al ${ultimoDia}/${String(mes).padStart(2, '0')}`}</div><div className="num py-1.5 font-semibold">{fmtUF(uf)}</div></div>
          <div><div className="etiqueta">UTM</div><div className="num py-1.5 font-semibold">${utm.toLocaleString('es-CL')}</div></div>
          {!cerrado && escribe && <button type="button" className="boton-sec" onClick={() => setEditar(true)}>Cambiar UF</button>}
        </>)}
        {!cerrado && escribe && (<>
          <button type="button" className="boton-sec" disabled={pendiente} title="UF del último día del mes y UTM, desde mindicador.cl"
            onClick={() => iniciar(async () => { const r = await actualizarIndicadoresAPI(empresaId, anio); setMsg(r.ok ? { ok: r.mensaje } : { error: r.error }); if (r.ok) { setEditar(false); router.refresh(); } })}>
            🔄 Traer de mindicador.cl</button>
        </>)}
        {!cerrado && escribe && (
          <button type="button" className="boton ml-auto" disabled={pendiente || !hayLineas || !ufTabla} title={ufTabla ? '' : 'Primero ingresa la UF del último día del mes'}
            onClick={() => confirm(`¿Cerrar el libro del mes? Se recalcula todo con UF ${fmtUF(uf)}, se guarda la foto de las liquidaciones y se genera el asiento de remuneraciones (si había uno, queda anulado).`) &&
              iniciar(async () => { const r = await cerrarLibro(empresaId, anio, mes); setMsg(r.ok ? { ok: r.mensaje } : { error: r.error }); })}>
            Cerrar libro y contabilizar
          </button>
        )}
        {cerrado && admin && (
          <button type="button" className="boton-sec ml-auto" disabled={pendiente}
            onClick={() => confirm('¿Reabrir el libro? Su asiento de remuneraciones quedará anulado.') &&
              iniciar(async () => { const r = await reabrirLibro(empresaId, anio, mes); setMsg(r.ok ? { ok: r.mensaje } : { error: r.error }); })}>
            Reabrir libro
          </button>
        )}
      </div>
      {!cerrado && !ufTabla && <p className="text-xs text-aviso">⚠️ Falta la UF del último día del mes en los indicadores. El cálculo usa la UF de referencia ({fmtUF(uf)}) y el libro no se puede cerrar hasta ingresarla.</p>}
      <Mensaje {...msg} />
    </div>
  );
}
