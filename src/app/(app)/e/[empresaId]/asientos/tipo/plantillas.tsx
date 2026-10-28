'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { buscarComprobantes, repartirIgual, resumenComprobante, type ComprobanteTipo, type LineaCT, type DistCT } from '@/herramientas/comprobantes-tipo';
import { clp, decimalCL, milesInput } from '@/lib/formato';
import { Mensaje } from '@/components/form-estado';
import { guardarPlantilla, eliminarPlantilla, copiarPlantilla } from './acciones';

type Form = Omit<ComprobanteTipo, 'id' | 'lineas' | 'dist' | 'distBase'> & { lineas: (Omit<LineaCT, 'debe' | 'haber'> & { debe: string; haber: string })[]; dist: (Omit<DistCT, 'pct'> & { pct: string })[]; distBase: string };
const lineaVacia = () => ({ cd: '', desc: '', debe: '', haber: '', cc: '' });
const vacio = (): Form => ({ nombre: '', descripcion: '', glosa: '', guardaMontos: false, lineas: [lineaVacia(), lineaVacia()], distActiva: false, distBase: '', dist: [{ cd: '', pct: '', cc: '' }] });
const aForm = (c: ComprobanteTipo): Form => ({ ...c, distBase: c.distBase ? milesInput(c.distBase) : '', lineas: c.lineas.map((l) => ({ ...l, debe: l.debe ? milesInput(l.debe) : '', haber: l.haber ? milesInput(l.haber) : '' })), dist: c.dist.length ? c.dist.map((d) => ({ ...d, pct: String(d.pct).replace('.', ',') })) : [{ cd: '', pct: '', cc: '' }] });
const desdeForm = (f: Form): Omit<ComprobanteTipo, 'id'> => ({ ...f, distBase: Math.round(decimalCL(f.distBase)), lineas: f.lineas.map((l) => ({ ...l, cd: l.cd.split(' ')[0], debe: Math.round(decimalCL(l.debe)), haber: Math.round(decimalCL(l.haber)) })), dist: f.dist.map((d) => ({ ...d, cd: d.cd.split(' ')[0], pct: decimalCL(d.pct) })) });

export function Plantillas({ empresaId, lista, cuentas, centros, otras, escribe }: {
  empresaId: string; lista: ComprobanteTipo[]; cuentas: { codigo: string; nombre: string }[]; centros: { codigo: string; nombre: string }[];
  otras: { id: string; razon_social: string }[]; escribe: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [ed, setEd] = useState<{ id: string | null; f: Form } | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pendiente, iniciar] = useTransition();
  const nombre = (cd: string) => cuentas.find((c) => c.codigo === cd)?.nombre || '';
  const run = (fn: () => Promise<{ ok: boolean; mensaje?: string; error?: string }>, cerrar = false) => iniciar(async () => {
    const r = await fn(); setMsg(r.ok ? { ok: r.mensaje } : { error: r.error }); if (r.ok) { if (cerrar) setEd(null); router.refresh(); }
  });
  const filtradas = buscarComprobantes(lista, q, nombre);
  const f = ed?.f;
  const set = (x: Partial<Form>) => setEd((e) => (e ? { ...e, f: { ...e.f, ...x } } : e));
  const setL = (i: number, x: Partial<Form['lineas'][number]>) => f && set({ lineas: f.lineas.map((l, j) => (j === i ? { ...l, ...x } : l)) });
  const setD = (i: number, x: Partial<Form['dist'][number]>) => f && set({ dist: f.dist.map((d, j) => (j === i ? { ...d, ...x } : d)) });
  const sumaPct = f ? f.dist.filter((d) => d.cd).reduce((s, d) => s + decimalCL(d.pct), 0) : 0;
  const cuadreL = f ? f.lineas.reduce((s, l) => s + decimalCL(l.debe) - decimalCL(l.haber), 0) : 0;

  return (
    <div className="space-y-4">
      <datalist id="ct-cuentas">{cuentas.map((c) => <option key={c.codigo} value={`${c.codigo} · ${c.nombre}`} />)}</datalist>
      <div className="flex flex-wrap gap-2">
        <input className="campo max-w-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, glosa o cuenta…" aria-label="Buscar plantilla" />
        <span className="flex-1" />
        {escribe && <button type="button" className="boton" onClick={() => { setMsg({}); setEd({ id: null, f: vacio() }); }}>＋ Nueva plantilla</button>}
      </div>
      <Mensaje {...msg} />
      {ed && f && (
        <section className="tarjeta space-y-3 border-acento/50 p-4 text-sm">
          <h2 className="font-semibold">{ed.id ? 'Editar plantilla' : 'Nueva plantilla'}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><label className="etiqueta" htmlFor="ct-n">Nombre</label><input id="ct-n" className="campo" value={f.nombre} onChange={(e) => set({ nombre: e.target.value })} /></div>
            <div><label className="etiqueta" htmlFor="ct-d">Descripción</label><input id="ct-d" className="campo" value={f.descripcion} onChange={(e) => set({ descripcion: e.target.value })} /></div>
            <div><label className="etiqueta" htmlFor="ct-g">Glosa del asiento</label><input id="ct-g" className="campo" value={f.glosa} placeholder="Se copia a la glosa del asiento" onChange={(e) => set({ glosa: e.target.value })} /></div>
          </div>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.guardaMontos} onChange={(e) => set({ guardaMontos: e.target.checked })} />Guardar también los montos (si no, quedan en cero para completarlos al usarla)</label>
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-xs">
            <thead className="text-left text-tenue"><tr className="border-b border-borde"><th className="py-1">Cuenta</th><th>Detalle</th><th className="w-32">Debe</th><th className="w-32">Haber</th><th className="w-44">Centro de costo</th><th className="w-6" /></tr></thead>
            <tbody>{f.lineas.map((l, i) => (
              <tr key={i} className="border-b border-borde/30">
                <td className="py-1 pr-1"><input list="ct-cuentas" className="campo num" aria-label={`Cuenta ${i + 1}`} value={l.cd} onChange={(e) => setL(i, { cd: e.target.value.split(' ')[0] })} /><div className="truncate text-[10px] text-tenue">{nombre(l.cd)}</div></td>
                <td className="pr-1"><input className="campo" aria-label={`Detalle ${i + 1}`} value={l.desc} onChange={(e) => setL(i, { desc: e.target.value })} /></td>
                <td className="pr-1"><input className="campo num text-right" inputMode="decimal" aria-label={`Debe ${i + 1}`} disabled={!f.guardaMontos} value={l.debe} onChange={(e) => setL(i, { debe: milesInput(e.target.value), haber: e.target.value ? '' : l.haber })} /></td>
                <td className="pr-1"><input className="campo num text-right" inputMode="decimal" aria-label={`Haber ${i + 1}`} disabled={!f.guardaMontos} value={l.haber} onChange={(e) => setL(i, { haber: milesInput(e.target.value), debe: e.target.value ? '' : l.debe })} /></td>
                <td className="pr-1"><select className="campo" aria-label={`Centro ${i + 1}`} value={l.cc} onChange={(e) => setL(i, { cc: e.target.value })}><option value="">Sin centro</option>{centros.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.nombre}</option>)}</select></td>
                <td><button type="button" className="text-tenue hover:text-peligro" aria-label="Quitar línea" onClick={() => set({ lineas: f.lineas.filter((_, j) => j !== i) })}>✕</button></td>
              </tr>
            ))}</tbody>
          </table></div>
          <div className="flex flex-wrap items-center gap-3"><button type="button" className="boton-sec" onClick={() => set({ lineas: [...f.lineas, lineaVacia()] })}>+ Línea</button>
            {f.guardaMontos && <span className={`text-xs ${Math.abs(cuadreL) < 1 ? 'text-acento' : 'text-aviso'}`}>{Math.abs(cuadreL) < 1 ? '✓ Cuadra' : `Diferencia ${clp(cuadreL)} (se puede completar al usarla)`}</span>}</div>
          <div className="rounded-md border border-borde p-3">
            <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={f.distActiva} onChange={(e) => set({ distActiva: e.target.checked })} />Distribuir un gasto por porcentaje entre varias cuentas o centros</label>
            {f.distActiva && <div className="mt-2 space-y-2">
              {f.guardaMontos && <div className="w-48"><label className="etiqueta" htmlFor="ct-base">Monto a repartir</label><input id="ct-base" className="campo num text-right" inputMode="decimal" value={f.distBase} onChange={(e) => set({ distBase: milesInput(e.target.value) })} /></div>}
              {f.dist.map((d, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[2fr_7rem_1fr_auto]">
                  <input list="ct-cuentas" className="campo num" aria-label={`Cuenta de gasto ${i + 1}`} placeholder="Cuenta de gasto" value={d.cd} onChange={(e) => setD(i, { cd: e.target.value.split(' ')[0] })} />
                  <input className="campo num text-right" inputMode="decimal" aria-label={`Porcentaje ${i + 1}`} placeholder="%" value={d.pct} onChange={(e) => setD(i, { pct: e.target.value })} />
                  <select className="campo" aria-label={`Centro de la distribución ${i + 1}`} value={d.cc} onChange={(e) => setD(i, { cc: e.target.value })}><option value="">Sin centro</option>{centros.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.nombre}</option>)}</select>
                  <button type="button" className="boton-sec" aria-label="Quitar tramo" onClick={() => set({ dist: f.dist.length === 1 ? [{ cd: '', pct: '', cc: '' }] : f.dist.filter((_, j) => j !== i) })}>✕</button>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="boton-sec" onClick={() => set({ dist: [...f.dist, { cd: '', pct: '', cc: '' }] })}>+ Tramo</button>
                <button type="button" className="boton-sec" onClick={() => set({ dist: repartirIgual(f.dist.map((d) => ({ ...d, pct: decimalCL(d.pct) }))).map((d) => ({ ...d, pct: String(d.pct).replace('.', ',') })) })}>Repartir en partes iguales</button>
                <span className={`text-xs ${Math.abs(sumaPct - 100) < 0.01 ? 'text-acento' : 'text-aviso'}`}>Suma {String(Math.round(sumaPct * 100) / 100).replace('.', ',')}% {Math.abs(sumaPct - 100) < 0.01 ? '✓' : `· faltan ${String(Math.round((100 - sumaPct) * 100) / 100).replace('.', ',')}%`}</span>
              </div>
            </div>}
          </div>
          <div className="flex gap-2"><button type="button" className="boton" disabled={pendiente} onClick={() => run(() => guardarPlantilla(empresaId, ed.id, desdeForm(f)), true)}>💾 Guardar</button><button type="button" className="boton-sec" onClick={() => setEd(null)}>Cancelar</button></div>
        </section>
      )}
      <div className="tarjeta divide-y divide-borde">
        {filtradas.length ? filtradas.map((c) => {
          const r = resumenComprobante(c);
          return (
            <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{c.nombre}{c.descripcion && <span className="text-tenue"> · {c.descripcion}</span>}</div>
                <div className="text-xs text-tenue">{r.cuentas} cuenta(s){r.dist ? ` · reparte en ${r.dist}` : ''}{c.guardaMontos ? ` · ${clp(r.total)}${r.cuadra ? '' : ' (sin cuadrar)'}` : ' · sin montos'}{c.glosa ? ` · glosa «${c.glosa}»` : ''}</div>
              </div>
              {escribe && <>
                <button type="button" className="boton-sec !px-2 !py-0.5" onClick={() => { setMsg({}); setEd({ id: c.id, f: aForm(c) }); }}>Editar</button>
                {otras.length > 0 && <select className="campo w-44 !py-0.5 text-xs" aria-label={`Copiar ${c.nombre} a otra empresa`} value="" onChange={(e) => e.target.value && run(() => copiarPlantilla(empresaId, c.id, e.target.value))}><option value="">📋 Copiar a…</option>{otras.map((o) => <option key={o.id} value={o.id}>{o.razon_social}</option>)}</select>}
                <button type="button" className="boton-sec !px-2 !py-0.5 text-peligro" onClick={() => confirm(`¿Eliminar la plantilla «${c.nombre}»?`) && run(() => eliminarPlantilla(empresaId, c.id))}>🗑</button>
              </>}
            </div>
          );
        }) : <p className="p-6 text-center text-tenue">{lista.length ? 'Ninguna plantilla coincide con la búsqueda.' : 'Aún no hay plantillas. Créalas aquí o desde «Nuevo asiento» con «Guardar como plantilla».'}</p>}
      </div>
    </div>
  );
}
