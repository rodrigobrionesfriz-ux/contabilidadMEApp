'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clp, fechaCL, hoyISO } from '@/lib/formato';
import { indiceAsiento, puntaje, totalAsiento, type AsientoBusqueda } from '@/lib/buscar-asientos';

const MAX = 300;
const TIPO: Record<string, string> = { manual: 'Manual', compra: 'Compra', venta: 'Venta', honorario: 'Honorario', remuneraciones: 'Remuneraciones', apertura: 'Apertura', cierre: 'Cierre', pago: 'Pago', anticipo: 'Anticipo' };

export function BuscadorComprobantes({ empresaId, asientos, cuentas, cerrados, desde, hasta, anio, escribe }: {
  empresaId: string; asientos: AsientoBusqueda[]; cuentas: Record<string, string>; cerrados: string[];
  desde: string; hasta: string; anio: number; escribe: boolean;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const [q, setQ] = useState('');
  const consulta = useDeferredValue(q);
  const [rango, setRango] = useState({ desde, hasta });
  const cerr = useMemo(() => new Set(cerrados), [cerrados]);
  const indices = useMemo(() => asientos.map((a) => ({ a, ix: indiceAsiento(a, (c) => cuentas[c]) })), [asientos, cuentas]);
  const resultado = useMemo(() => {
    // Sin nada escrito no se lista nada (no es el libro diario)
    if (!consulta.trim()) return [];
    const r = indices.map((x) => ({ ...x, p: puntaje(x.ix, consulta) })).filter((x) => x.p > 0);
    // Primero lo más parecido (N° exacto, monto exacto), luego lo más reciente
    r.sort((x, y) => y.p - x.p || y.a.fecha.localeCompare(x.a.fecha) || y.a.numero - x.a.numero);
    return r;
  }, [indices, consulta]);

  const ir = (d: string, h: string) => {
    setRango({ desde: d, hasta: h });
    if (d && h) router.replace(`${ruta}?desde=${d}&hasta=${h}`, { scroll: false });
  };
  const hoy = hoyISO();
  const mesActual = () => { const [y, m] = hoy.split('-').map(Number); ir(`${y}-${String(m).padStart(2, '0')}-01`, new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)); };
  const lineaQueCalza = (a: AsientoBusqueda) => {
    const t = consulta.trim().toLowerCase();
    if (!t) return null;
    const l = a.asiento_lineas.find((x) => (x.glosa ?? '').toLowerCase().includes(t) || (cuentas[x.cuenta] ?? '').toLowerCase().includes(t));
    return l ? `${l.cuenta} ${cuentas[l.cuenta] ?? ''}${l.glosa ? ` · ${l.glosa}` : ''}` : null;
  };

  return (
    <div className="space-y-3">
      <div className="tarjeta flex flex-wrap items-end gap-3 p-3">
        <div className="min-w-64 flex-1">
          <label className="etiqueta" htmlFor="bq">Buscar</label>
          <input id="bq" value={q} onChange={(e) => setQ(e.target.value)} autoFocus className="campo" type="search"
            placeholder="N° de comprobante, monto (1.732.555) o texto: glosa, cuenta, RUT, folio…" />
        </div>
        <div><label className="etiqueta" htmlFor="bq-d">Desde</label>
          <input id="bq-d" type="date" value={rango.desde} max={rango.hasta} onChange={(e) => ir(e.target.value, rango.hasta)} className="campo num" /></div>
        <div><label className="etiqueta" htmlFor="bq-h">Hasta</label>
          <input id="bq-h" type="date" value={rango.hasta} min={rango.desde} onChange={(e) => ir(rango.desde, e.target.value)} className="campo num" /></div>
        <div className="flex gap-1 pb-0.5">
          <button type="button" className="boton-sec text-xs" onClick={mesActual}>Este mes</button>
          <button type="button" className="boton-sec text-xs" onClick={() => ir(`${anio}-01-01`, `${anio}-12-31`)}>Año {anio}</button>
        </div>
      </div>

      <p className="text-xs text-tenue">
        {consulta.trim() ? `${resultado.length} de ${asientos.length} comprobantes` : `${asientos.length} comprobantes`} entre el {fechaCL(desde)} y el {fechaCL(hasta)}
        {resultado.length > MAX && ` · se muestran los primeros ${MAX}, afina la búsqueda`}
      </p>

      {!consulta.trim() ? (
        <div className="tarjeta p-8 text-center text-sm text-tenue">🔎 Escribe un N° de comprobante, un monto o un texto para buscar.</div>
      ) : resultado.length === 0 ? (
        <div className="tarjeta p-8 text-center text-tenue">{asientos.length ? 'Ningún comprobante coincide con la búsqueda.' : 'Sin comprobantes en el rango de fechas.'}</div>
      ) : (
        <div className="tarjeta max-h-[calc(100dvh-17rem)] overflow-auto">
          <table className="w-full min-w-[720px] table-fixed text-[13px]">
            <colgroup><col className="w-[70px]" /><col className="w-[92px]" /><col className="w-[120px]" /><col /><col className="w-[120px]" /><col className="w-[90px]" /></colgroup>
            <thead className="sticky top-0 z-10 bg-panel text-left text-[10px] text-tenue uppercase shadow-[0_1px_0_var(--borde)]">
              <tr><th className="px-2 py-1.5">N°</th><th className="px-2 py-1.5">Fecha</th><th className="px-2 py-1.5">Tipo</th><th className="px-2 py-1.5">Glosa</th><th className="px-2 py-1.5 text-right">Total</th><th /></tr>
            </thead>
            <tbody>
              {resultado.slice(0, MAX).map(({ a }) => {
                const det = lineaQueCalza(a);
                const editable = escribe && !a.anulado && a.tipo !== 'cierre' && !cerr.has(a.fecha.slice(0, 7));
                return (
                  <tr key={a.id} className={`border-t border-borde/40 align-top hover:bg-panel-2/50 ${a.anulado ? 'opacity-50' : ''}`}>
                    <td className="px-2 py-1.5"><Link href={`/e/${empresaId}/asientos/${a.id}`} className="num font-semibold hover:text-acento">{a.numero}</Link></td>
                    <td className="num px-2 py-1.5 text-tenue">{fechaCL(a.fecha)}</td>
                    <td className="truncate px-2 py-1.5 text-xs text-tenue" title={TIPO[a.tipo] ?? a.tipo}>{TIPO[a.tipo] ?? a.tipo}</td>
                    <td className="px-2 py-1.5">
                      <div className="flex min-w-0 items-center gap-1.5">
                        {a.anulado && <span className="shrink-0 rounded bg-peligro/20 px-1 text-[10px] font-semibold text-peligro">ANULADO</span>}
                        <Link href={`/e/${empresaId}/asientos/${a.id}`} className="min-w-0 truncate hover:text-acento" title={a.glosa}>{a.glosa}</Link>
                      </div>
                      {det && <div className="truncate text-xs text-tenue" title={det}>{det}</div>}
                    </td>
                    <td className="num px-2 py-1.5 text-right whitespace-nowrap">{clp(totalAsiento(a))}</td>
                    <td className="px-2 py-1.5 text-right text-xs whitespace-nowrap">
                      {editable && <Link href={a.tipo === 'apertura' ? `/e/${empresaId}/apertura?anio=${a.fecha.slice(0, 4)}` : `/e/${empresaId}/asientos/${a.id}/editar`} className="text-tenue hover:text-acento">✏️ Editar</Link>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
