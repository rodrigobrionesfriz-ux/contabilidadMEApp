'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { leerCartola, emparejarCartola, resumenConciliacion, type LineaCartola, type MovBanco } from '@/tesoreria/conciliacion';
import { clp, decimalCL, fechaCL } from '@/lib/formato';
import { Mensaje } from '@/components/form-estado';
import { marcarLineas, guardarSaldoBanco } from './acciones';

export function Conciliacion({ empresaId, cuenta, anio, escribe, saldoBanco, movs, marcados }: {
  empresaId: string; cuenta: string; anio: number; escribe: boolean; saldoBanco: number; movs: (MovBanco & { numero: number })[]; marcados: number[];
}) {
  const router = useRouter();
  const [sel, setSel] = useState(() => new Set(marcados));
  const [saldoTxt, setSaldoTxt] = useState(saldoBanco ? String(saldoBanco) : '');
  const [cartola, setCartola] = useState<LineaCartola[] | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pendiente, iniciar] = useTransition();
  const r = resumenConciliacion(movs, sel, decimalCL(saldoTxt));
  const em = cartola ? emparejarCartola(cartola, movs, sel) : null;
  const aplicar = (ids: number[], conciliar: boolean) => iniciar(async () => {
    const prev = new Set(sel);
    setSel((s) => { const n = new Set(s); ids.forEach((i) => (conciliar ? n.add(i) : n.delete(i))); return n; });
    const res = await marcarLineas(empresaId, ids, conciliar);
    if (!res.ok) { setSel(prev); setMsg({ error: res.error }); } else { setMsg({ ok: res.mensaje }); router.refresh(); }
  });
  const leer = async (file: File | undefined) => {
    if (!file) return;
    try {
      const XLSX = await import('xlsx');
      // raw: el CSV se lee como texto (evita que 10/01 se convierta en 1 de octubre); en Excel las fechas llegan como Date
      const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', raw: true, cellDates: true });
      const filas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 });
      const c = leerCartola(filas);
      if (!c.length) { setMsg({ error: 'No se detectaron movimientos. La cartola debe tener columnas de fecha y monto.' }); return; }
      setCartola(c); setMsg({ ok: `Cartola cargada: ${c.length} movimientos.` });
    } catch (e) { setMsg({ error: 'No se pudo leer la cartola: ' + (e instanceof Error ? e.message : String(e)) }); }
  };
  const kpi = (l: string, v: number | string, tono = '') => <div className="tarjeta p-3"><p className="text-[10px] text-tenue uppercase">{l}</p><p className={`num text-base font-semibold ${tono}`}>{typeof v === 'number' ? clp(v) : v}</p></div>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpi('Saldo según libros', r.saldoLibros)}{kpi('Saldo según banco', r.saldoBanco)}{kpi('Diferencia', r.diferencia, Math.abs(r.diferencia) < 1 ? 'text-acento' : 'text-peligro')}{kpi('Sin conciliar', `${r.pendientes} (${clp(r.sumaPendientes)})`)}
      </div>
      {r.cuadra && <p className="text-sm text-acento">✅ Conciliado: el saldo de libros coincide con el del banco.</p>}
      {!r.cuadra && r.saldoBanco !== 0 && <p className="text-sm text-aviso">La diferencia de {clp(r.diferencia)} debería explicarse por los movimientos sin conciliar ({clp(r.sumaPendientes)}) y por cargos del banco aún no registrados.</p>}
      <Mensaje {...msg} />
      {escribe && (
        <div className="tarjeta flex flex-wrap items-end gap-3 p-4 text-sm">
          <div><label className="etiqueta" htmlFor="saldo-banco">Saldo según cartola</label><input id="saldo-banco" value={saldoTxt} onChange={(e) => setSaldoTxt(e.target.value)} inputMode="numeric" className="campo num w-44" /></div>
          <button type="button" className="boton-sec" disabled={pendiente} onClick={() => iniciar(async () => { const x = await guardarSaldoBanco(empresaId, cuenta, anio, decimalCL(saldoTxt)); setMsg(x.ok ? { ok: x.mensaje } : { error: x.error }); })}>Guardar saldo</button>
          <label className="boton-sec cursor-pointer">📤 Cargar cartola (Excel o CSV)<input type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(e) => { leer(e.target.files?.[0]); e.target.value = ''; }} /></label>
          <button type="button" className="text-xs text-acento hover:underline" onClick={() => aplicar(movs.filter((m) => !sel.has(m.id)).map((m) => m.id), true)}>✓ Marcar todos</button>
          <button type="button" className="text-xs text-tenue hover:underline" onClick={() => aplicar([...sel], false)}>✗ Desmarcar todos</button>
        </div>
      )}
      {cartola && em && (
        <section className="tarjeta space-y-2 p-4 text-sm">
          <h2 className="font-semibold">📤 Cartola cargada ({cartola.length} movimientos)</h2>
          <p className="text-xs text-tenue">{em.pares.length} coinciden por monto con movimientos pendientes. {em.sinMatch.length} sin coincidencia (podrían ser cargos o abonos del banco no registrados).</p>
          <div className="flex gap-2">
            {escribe && em.pares.length > 0 && <button type="button" className="boton" disabled={pendiente} onClick={() => aplicar(em.pares.map((p) => p.mov.id), true)}>🔗 Conciliar {em.pares.length} coincidencia(s)</button>}
            <button type="button" className="boton-sec" onClick={() => setCartola(null)}>Descartar cartola</button>
          </div>
          {em.sinMatch.length > 0 && <ul className="list-inside list-disc text-xs text-tenue">{em.sinMatch.slice(0, 12).map((c, i) => <li key={i}>{c.fecha} · {c.desc} · {clp(c.monto)}</li>)}{em.sinMatch.length > 12 && <li>… y {em.sinMatch.length - 12} más</li>}</ul>}
        </section>
      )}
      <div className="tarjeta overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-tenue uppercase"><tr className="border-b border-borde"><th className="w-10 px-3 py-2">✓</th><th className="px-2 py-2">Fecha</th><th className="px-2 py-2">N°</th><th className="px-2 py-2">Glosa</th><th className="px-2 py-2 text-right">Monto</th><th className="px-3 py-2">Estado</th></tr></thead>
          <tbody>
            {movs.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-tenue">Sin movimientos en esta cuenta.</td></tr>}
            {movs.map((m) => {
              const ok = sel.has(m.id), monto = m.debe - m.haber;
              return (
                <tr key={m.id} className={`border-b border-borde/40 ${ok ? 'opacity-55' : ''}`}>
                  <td className="px-3 py-1"><input type="checkbox" aria-label={`Conciliar ${m.glosa}`} disabled={!escribe || pendiente} checked={ok} onChange={(e) => aplicar([m.id], e.target.checked)} /></td>
                  <td className="num px-2 py-1">{fechaCL(m.fecha)}</td><td className="num px-2 py-1">{m.numero}</td><td className="px-2 py-1">{m.glosa}</td>
                  <td className={`num px-2 py-1 text-right ${monto < 0 ? 'text-peligro' : 'text-acento'}`}>{clp(monto)}</td>
                  <td className="px-3 py-1">{ok ? <span className="text-acento">✓ Conciliado</span> : <span className="text-tenue">Pendiente</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-tenue">{r.conciliados} de {movs.length} conciliados. La cartola se empareja por monto (en valor absoluto) con movimientos pendientes, igual que en el sistema actual.</p>
    </div>
  );
}
