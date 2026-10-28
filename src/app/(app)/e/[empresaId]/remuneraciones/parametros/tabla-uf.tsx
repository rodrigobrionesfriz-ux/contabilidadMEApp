'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { decimalCL, decimalInput, milesInput, MESES } from '@/lib/formato';

const txt = (n: number | null | undefined, dec: number) => (n ? n.toLocaleString('es-CL', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : '');
import { Mensaje } from '@/components/form-estado';
import { guardarIndicador } from '../acciones';
import { actualizarIndicadores } from '../indicadores-cliente';

interface Fila { periodo: string; uf: number | null; utm: number | null; actualizado: string }

/** UF del último día de cada mes y UTM del mes: se ingresan a mano y son comunes a todas las empresas. */
export function TablaUF({ empresaId, anio, filas, utmSII, cerrados, editable }: {
  empresaId: string; anio: number; filas: Fila[]; utmSII: (number | null)[]; cerrados: string[]; editable: boolean;
}) {
  const router = useRouter();
  const per = (m: number) => `${anio}-${String(m).padStart(2, '0')}`;
  const inicial = () => Object.fromEntries(MESES.map((_, i) => { const f = filas.find((x) => x.periodo === per(i + 1)); return [per(i + 1), { uf: txt(f?.uf, 2), utm: txt(f?.utm, 0) }]; }));
  const [v, setV] = useState<Record<string, { uf: string; utm: string }>>(inicial);
  // Si llegan valores nuevos del servidor (después de guardar o de la API), la tabla se rearma.
  const firma = `${anio}|${filas.map((f) => `${f.periodo}:${f.uf}:${f.utm}`).join()}`;
  const [firmaVista, setFirmaVista] = useState(firma);
  if (firma !== firmaVista) { setFirmaVista(firma); setV(inicial()); }
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pendiente, iniciar] = useTransition();
  const original = inicial();
  const cambiados = Object.keys(v).filter((k) => v[k].uf !== original[k].uf || v[k].utm !== original[k].utm);
  const guardar = () => iniciar(async () => {
    for (const k of cambiados) {
      if (!v[k].uf.trim()) { setMsg({ error: `Falta la UF de ${k}.` }); return; }
      const r = await guardarIndicador(empresaId, k, decimalCL(v[k].uf), v[k].utm.trim() ? decimalCL(v[k].utm) : null);
      if (!r.ok) { setMsg({ error: `${k}: ${r.error}` }); return; }
    }
    setMsg({ ok: `${cambiados.length} ${cambiados.length === 1 ? 'mes guardado' : 'meses guardados'}. Las liquidaciones abiertas se recalculan con estos valores.` });
    router.refresh();
  });
  const hoy = new Date().toISOString().slice(0, 7);
  return (
    <section id="uf-mensual" className="tarjeta space-y-3 p-4 text-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold">UF y UTM por mes · {anio}</h2>
          <p className="text-xs text-tenue">Las remuneraciones usan la UF del último día del mes (sii.cl → Valores y fechas). Es la misma para todas las empresas. Sin la UF del mes no se puede cerrar el libro.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {editable && <button type="button" className="boton py-1" disabled={pendiente} title="UF del último día de cada mes y UTM, desde sii.cl (o mindicador.cl)"
            onClick={() => iniciar(async () => { const r = await actualizarIndicadores(empresaId, anio); setMsg(r.ok ? { ok: r.mensaje } : { error: r.error }); if (r.ok) router.refresh(); })}>
            {pendiente ? 'Consultando…' : '🔄 Actualizar desde el SII'}</button>}
          <a className="boton-sec py-1" href={`?anio=${anio - 1}#uf-mensual`}>← {anio - 1}</a>
          <a className="boton-sec py-1" href={`?anio=${anio + 1}#uf-mensual`}>{anio + 1} →</a>
        </div>
      </div>
      <table className="w-full max-w-2xl text-xs">
        <thead className="text-left text-tenue"><tr><th className="py-1">Mes</th><th className="text-right">UF último día</th><th className="text-right">UTM</th><th className="pl-3">Estado</th></tr></thead>
        <tbody>
          {MESES.map((m, i) => {
            const k = per(i + 1); const f = filas.find((x) => x.periodo === k); const dia = new Date(anio, i + 1, 0).getDate();
            const falta = !f?.uf && k <= hoy;
            return (
              <tr key={k} className="border-t border-borde/30">
                <td className="py-1">{m} <span className="text-tenue">({dia}/{String(i + 1).padStart(2, '0')})</span></td>
                <td className="py-1 text-right"><input aria-label={`UF ${m}`} disabled={!editable} value={v[k].uf} onChange={(e) => setV({ ...v, [k]: { ...v[k], uf: decimalInput(e.target.value, 2) } })} className={`campo num w-32 py-1 text-right text-xs ${falta ? 'border-aviso' : ''}`} /></td>
                <td className="py-1 text-right"><input aria-label={`UTM ${m}`} disabled={!editable} value={v[k].utm} placeholder={utmSII[i] ? utmSII[i]!.toLocaleString('es-CL') : ''} onChange={(e) => setV({ ...v, [k]: { ...v[k], utm: milesInput(e.target.value) } })} className="campo num w-28 py-1 text-right text-xs" /></td>
                <td className="py-1 pl-3 text-tenue">{cerrados.includes(k) ? '🔒 libro cerrado' : f?.uf ? `✓ ${new Date(f.actualizado).toLocaleDateString('es-CL')}` : falta ? <span className="text-aviso">falta</span> : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[11px] text-tenue">UTM vacía: se usa la publicada por el SII (en gris). Cambiar la UF de un mes con libro cerrado no altera ese libro: queda con la UF con que se cerró.</p>
      {editable && <button type="button" className="boton" disabled={pendiente || !cambiados.length} onClick={guardar}>Guardar {cambiados.length ? `(${cambiados.length})` : ''}</button>}
      <Mensaje {...msg} />
    </section>
  );
}
