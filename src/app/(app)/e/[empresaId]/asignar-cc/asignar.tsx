'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { clp, fechaCL, MESES } from '@/lib/formato';
import { Mensaje } from '@/components/form-estado';
import { asignarCentro } from './acciones';

export interface LineaCC { id: number; asientoId: string; cuenta: string; nombreCuenta: string; fecha: string; numero: number; tipo: string; glosa: string; monto: number; cc: string; doc: string }

export function AsignarCC({ empresaId, filas, centros, escribe }: { empresaId: string; filas: LineaCC[]; centros: { codigo: string; nombre: string; nivel: number; padre: string | null }[]; escribe: boolean }) {
  const router = useRouter();
  const [ver, setVer] = useState<'pendientes' | 'asignados' | 'todos'>('pendientes');
  const [mes, setMes] = useState('');
  const [cuenta, setCuenta] = useState('');
  const [tipo, setTipo] = useState('');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [bulk, setBulk] = useState('');
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pendiente, iniciar] = useTransition();
  const t = q.toLowerCase().trim();
  const vis = filas.filter((m) => {
    if (ver === 'pendientes' && m.cc) return false;
    if (ver === 'asignados' && !m.cc) return false;
    if (mes && +m.fecha.slice(5, 7) !== +mes) return false;
    if (cuenta && m.cuenta !== cuenta) return false;
    if (tipo && m.tipo !== tipo) return false;
    return !t || `${m.glosa} ${m.doc} ${m.cuenta} ${m.nombreCuenta} ${m.numero}`.toLowerCase().includes(t);
  });
  const pendientes = filas.filter((m) => !m.cc);
  const montoPend = pendientes.reduce((s, m) => s + m.monto, 0);
  const cuentasUsadas = [...new Map(filas.map((m) => [m.cuenta, m.nombreCuenta])).entries()].sort();
  const tipos = [...new Set(filas.map((m) => m.tipo))].sort();
  const run = (ids: number[], cc: string | null) => iniciar(async () => {
    const r = await asignarCentro(empresaId, ids, cc);
    setMsg(r.ok ? { ok: r.mensaje } : { error: r.error });
    if (r.ok) { setSel(new Set()); router.refresh(); }
  });
  const todosSel = vis.length > 0 && vis.every((m) => sel.has(m.id));
  const opciones = centros.map((c) => <option key={c.codigo} value={c.codigo}>{c.nivel === 2 ? '  ↳ ' : ''}{c.codigo} · {c.nombre}</option>);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="tarjeta p-3"><div className="text-[10px] text-tenue uppercase">Sin centro</div><div className="num text-lg font-semibold text-amber-500">{pendientes.length} mov. · {clp(montoPend)}</div></div>
        <div className="tarjeta p-3"><div className="text-[10px] text-tenue uppercase">Con centro</div><div className="num text-lg font-semibold">{filas.length - pendientes.length}</div></div>
        <div className="tarjeta p-3"><div className="text-[10px] text-tenue uppercase">Avance</div><div className="num text-lg font-semibold text-acento">{filas.length ? Math.round((1 - pendientes.length / filas.length) * 100) : 100}%</div></div>
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="flex gap-1 rounded-md border border-borde p-1 text-sm">{(['pendientes', 'asignados', 'todos'] as const).map((v) => <button key={v} type="button" onClick={() => setVer(v)} className={`rounded px-3 py-1 ${ver === v ? 'bg-panel-2 text-acento' : 'text-tenue'}`}>{v === 'pendientes' ? 'Sin centro' : v === 'asignados' ? 'Con centro' : 'Todos'}</button>)}</div>
        <select className="campo w-36" value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Mes"><option value="">Todo el año</option>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
        <select className="campo w-64" value={cuenta} onChange={(e) => setCuenta(e.target.value)} aria-label="Cuenta"><option value="">Todas las cuentas</option>{cuentasUsadas.map(([c, n]) => <option key={c} value={c}>{c} · {n}</option>)}</select>
        <select className="campo w-40" value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Origen"><option value="">Todo origen</option>{tipos.map((x) => <option key={x}>{x}</option>)}</select>
        <input className="campo w-56" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Glosa, documento o N°…" aria-label="Buscar" />
      </div>
      {escribe && sel.size > 0 && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-md border border-acento/50 bg-panel p-2 text-sm">
          <strong>{sel.size} seleccionado(s)</strong> · {clp(filas.filter((m) => sel.has(m.id)).reduce((s, m) => s + m.monto, 0))}
          <select className="campo w-64" value={bulk} onChange={(e) => setBulk(e.target.value)} aria-label="Centro para los seleccionados"><option value="">Elegir centro…</option>{opciones}</select>
          <button type="button" className="boton" disabled={!bulk || pendiente} onClick={() => run([...sel], bulk)}>Asignar</button>
          <button type="button" className="boton-sec" disabled={pendiente} onClick={() => confirm('¿Quitar el centro de costo de los seleccionados?') && run([...sel], null)}>Quitar centro</button>
          <button type="button" className="boton-sec" onClick={() => setSel(new Set())}>Limpiar selección</button>
        </div>
      )}
      <Mensaje {...msg} />
      <div className="tarjeta overflow-x-auto"><table className="w-full min-w-[900px] text-xs">
        <thead className="text-left text-tenue"><tr className="border-b border-borde">
          <th className="w-8 p-2">{escribe && <input type="checkbox" aria-label="Seleccionar todos los visibles" checked={todosSel} onChange={() => setSel(todosSel ? new Set() : new Set(vis.map((m) => m.id)))} />}</th>
          <th>Fecha</th><th>Comprobante</th><th>Cuenta</th><th>Detalle</th><th className="text-right">Monto</th><th className="w-64 pr-2">Centro de costo</th></tr></thead>
        <tbody>{vis.length ? vis.slice(0, 1500).map((m) => (
          <tr key={m.id} className={`border-b border-borde/30 ${sel.has(m.id) ? 'bg-acento/5' : ''}`}>
            <td className="p-2">{escribe && <input type="checkbox" aria-label={`Seleccionar movimiento ${m.id}`} checked={sel.has(m.id)} onChange={() => setSel((s) => { const n = new Set(s); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n; })} />}</td>
            <td className="num">{fechaCL(m.fecha)}</td>
            <td><Link className="num text-acento hover:underline" href={`/e/${empresaId}/asientos/${m.asientoId}`}>N° {m.numero}</Link> <span className="text-tenue">{m.tipo}</span></td>
            <td><span className="num">{m.cuenta}</span> {m.nombreCuenta}</td>
            <td className="max-w-xs truncate" title={`${m.glosa} ${m.doc}`}>{m.glosa}{m.doc && <span className="text-tenue"> · {m.doc}</span>}</td>
            <td className={`num text-right ${m.monto < 0 ? 'text-peligro' : ''}`}>{clp(m.monto)}</td>
            <td className="pr-2">{escribe ? <select className={`campo !py-1 ${m.cc ? '' : 'border-amber-500/50'}`} aria-label={`Centro del movimiento ${m.id}`} value={m.cc} disabled={pendiente} onChange={(e) => run([m.id], e.target.value || null)}><option value="">Sin centro</option>{opciones}</select> : (m.cc || '–')}</td>
          </tr>
        )) : <tr><td colSpan={7} className="p-6 text-center text-tenue">{ver === 'pendientes' && !mes && !cuenta && !q ? '✅ No quedan movimientos sin centro de costo en el año.' : 'Sin movimientos para mostrar.'}</td></tr>}</tbody>
      </table></div>
      {vis.length > 1500 && <p className="text-xs text-tenue">Se muestran los primeros 1.500 de {vis.length}: usa los filtros para acotar.</p>}
    </div>
  );
}
