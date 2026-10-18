'use client';

import { useState, useTransition } from 'react';
import { decimalCL, decimalTexto } from '@/lib/formato';
import { useRouter } from 'next/navigation';
import { Mensaje } from '@/components/form-estado';
import { cerrarLibro, reabrirLibro } from '../acciones';

export function AccionesLibro({ empresaId, anio, mes, uf, utm, cerrado, escribe, admin, hayLineas }: {
  empresaId: string; anio: number; mes: number; uf: number; utm: number; cerrado: boolean; escribe: boolean; admin: boolean; hayLineas: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState({ uf: decimalTexto(uf), utm: decimalTexto(utm) });
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pendiente, iniciar] = useTransition();
  const num = decimalCL;
  return (
    <div className="tarjeta flex flex-wrap items-end gap-3 p-3 text-sm">
      <div><label className="etiqueta" htmlFor="uf">UF del mes</label><input id="uf" disabled={cerrado} value={v.uf} onChange={(e) => setV({ ...v, uf: e.target.value })} className="campo num w-36" /></div>
      <div><label className="etiqueta" htmlFor="utm">UTM del mes</label><input id="utm" disabled={cerrado} value={v.utm} onChange={(e) => setV({ ...v, utm: e.target.value })} className="campo num w-32" /></div>
      {!cerrado && <button type="button" className="boton-sec" onClick={() => router.push(`?anio=${anio}&mes=${mes}&uf=${num(v.uf)}&utm=${num(v.utm)}`)}>Recalcular</button>}
      {!cerrado && escribe && (
        <button type="button" className="boton" disabled={pendiente || !hayLineas}
          onClick={() => confirm('¿Cerrar el libro del mes? Se guarda la foto de las liquidaciones y se genera el asiento de remuneraciones (si había uno, queda anulado).') &&
            iniciar(async () => { const r = await cerrarLibro(empresaId, anio, mes, num(v.uf), num(v.utm)); setMsg(r.ok ? { ok: r.mensaje } : { error: r.error }); })}>
          Cerrar libro y contabilizar
        </button>
      )}
      {cerrado && admin && (
        <button type="button" className="boton-sec" disabled={pendiente}
          onClick={() => confirm('¿Reabrir el libro? Su asiento de remuneraciones quedará anulado.') &&
            iniciar(async () => { const r = await reabrirLibro(empresaId, anio, mes); setMsg(r.ok ? { ok: r.mensaje } : { error: r.error }); })}>
          Reabrir libro
        </button>
      )}
      <Mensaje {...msg} />
    </div>
  );
}
