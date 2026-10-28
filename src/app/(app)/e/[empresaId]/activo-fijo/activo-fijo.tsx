'use client';

import { Fragment, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AF_CATEGORIAS, afCat, calcularDepreciacionContable, calcularDepreciacionTributaria, type Bien } from '@/activo-fijo/depreciacion';
import { clp, decimalCL, hoyISO, milesInput } from '@/lib/formato';
import { Mensaje } from '@/components/form-estado';
import { guardarActivo, eliminarActivo, contabilizarDepreciacion, type FormActivo } from './acciones';

export interface FilaActivo { id: string; descripcion: string; categoria: string; fecha: string; ficha: Bien; documentoId: string | null; estado: string }
export interface CompraAF { id: string; fecha: string; rotulo: string; base: number }

type Txt = Record<'valor' | 'residual' | 'vidaContable' | 'valorTributario' | 'residualTributario' | 'vidaTributaria', string>;
const vacio = (): Omit<FormActivo, keyof Txt> & { txt: Txt } => {
  const c = AF_CATEGORIAS[1];
  return { descripcion: '', categoria: c.k, fecha: hoyISO(), documentoId: null, metodoContable: 'lineal', metodoTributario: 'lineal', fechaInicioDepContable: hoyISO(), fechaInicioDepTributaria: hoyISO(),
    txt: { valor: '', residual: '0', vidaContable: String(c.vida), valorTributario: '', residualTributario: '0', vidaTributaria: String(c.vida) } };
};

export function ActivoFijo({ empresaId, anio, filas, compras, escribe, depreciacion }: {
  empresaId: string; anio: number; filas: FilaActivo[]; compras: CompraAF[]; escribe: boolean; depreciacion: { numero: number } | null;
}) {
  const router = useRouter();
  const [ed, setEd] = useState<{ id: string | null; f: ReturnType<typeof vacio> } | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pendiente, iniciar] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; mensaje?: string; error?: string }>, cerrar = false) => iniciar(async () => {
    const r = await fn(); setMsg(r.ok ? { ok: r.mensaje } : { error: r.error }); if (r.ok) { if (cerrar) setEd(null); router.refresh(); }
  });
  const calc = filas.filter((f) => f.estado !== 'anulado').map((f) => {
    const b = { ...f.ficha, cat: f.categoria, fecha: f.fecha };
    return { f, c: calcularDepreciacionContable(b, anio), t: calcularDepreciacionTributaria(b, anio) };
  });
  const tot = calc.reduce((s, { f, c, t }) => ({ valor: s.valor + (+(f.ficha.valorContable ?? f.ficha.valor ?? 0)), acum: s.acum + c.acumulada, libro: s.libro + c.valorLibro, dep: s.dep + c.deprEsteAnio, trib: s.trib + t.deprEsteAnio, dif: s.dif + (t.acumulada - c.acumulada) }), { valor: 0, acum: 0, libro: 0, dep: 0, trib: 0, dif: 0 });

  const form = ed?.f;
  const bienForm: Bien | null = form ? {
    cat: form.categoria, fecha: form.fecha, valor: decimalCL(form.txt.valor), valorContable: decimalCL(form.txt.valor), residualContable: decimalCL(form.txt.residual), residual: decimalCL(form.txt.residual),
    vidaContable: decimalCL(form.txt.vidaContable), metodoContable: form.metodoContable, fechaInicioDepContable: form.fechaInicioDepContable,
    valorTributario: decimalCL(form.txt.valorTributario) || decimalCL(form.txt.valor), residualTributario: decimalCL(form.txt.residualTributario), vidaTributaria: decimalCL(form.txt.vidaTributaria), metodoTributario: form.metodoTributario, fechaInicioDepTributaria: form.fechaInicioDepTributaria,
  } : null;
  const prev = bienForm && bienForm.valor && bienForm.vidaContable && bienForm.vidaTributaria ? { c: calcularDepreciacionContable(bienForm, anio), t: calcularDepreciacionTributaria(bienForm, anio) } : null;
  const set = (c: Partial<ReturnType<typeof vacio>>) => setEd((e) => (e ? { ...e, f: { ...e.f, ...c } } : e));
  const setT = (k: keyof Txt, v: string) => setEd((e) => (e ? { ...e, f: { ...e.f, txt: { ...e.f.txt, [k]: v } } } : e));
  const editar = (f: FilaActivo) => {
    const b = f.ficha;
    setEd({ id: f.id, f: { descripcion: f.descripcion, categoria: f.categoria, fecha: f.fecha, documentoId: f.documentoId, metodoContable: b.metodoContable || 'lineal', metodoTributario: b.metodoTributario || b.metodo || 'lineal',
      fechaInicioDepContable: b.fechaInicioDepContable || `${+f.fecha.slice(0, 4) + 1}-01-01`, fechaInicioDepTributaria: b.fechaInicioDepTributaria || `${+f.fecha.slice(0, 4) + 1}-01-01`,
      txt: { valor: milesInput(b.valorContable ?? b.valor ?? ''), residual: milesInput(b.residualContable ?? b.residual ?? 0), vidaContable: String(b.vidaContable || b.vida || afCat(f.categoria).vida),
        valorTributario: milesInput(b.valorTributario ?? b.valor ?? ''), residualTributario: milesInput(b.residualTributario ?? 0), vidaTributaria: String(b.vidaTributaria || b.vida || afCat(f.categoria).vida) } } });
  };
  const elegirCompra = (id: string) => {
    const d = compras.find((x) => x.id === id);
    if (!d) { set({ documentoId: null }); return; }
    setEd((e) => e ? { ...e, f: { ...e.f, documentoId: id, fecha: d.fecha, fechaInicioDepContable: d.fecha, fechaInicioDepTributaria: d.fecha, descripcion: e.f.descripcion || d.rotulo.split(' · ').slice(1).join(' · '),
      txt: { ...e.f.txt, valor: milesInput(d.base), valorTributario: milesInput(d.base) } } } : e);
  };
  const guardar = () => form && run(() => guardarActivo(empresaId, ed!.id, {
    descripcion: form.descripcion, categoria: form.categoria, fecha: form.fecha, documentoId: form.documentoId,
    valor: decimalCL(form.txt.valor), residual: decimalCL(form.txt.residual), vidaContable: decimalCL(form.txt.vidaContable), metodoContable: form.metodoContable, fechaInicioDepContable: form.fechaInicioDepContable,
    valorTributario: decimalCL(form.txt.valorTributario), residualTributario: decimalCL(form.txt.residualTributario), vidaTributaria: decimalCL(form.txt.vidaTributaria), metodoTributario: form.metodoTributario, fechaInicioDepTributaria: form.fechaInicioDepTributaria,
  }), true);
  const num = (k: keyof Txt, l: string) => <div><label className="etiqueta" htmlFor={`af-${k}`}>{l}</label><input id={`af-${k}`} inputMode="decimal" value={form!.txt[k]} onChange={(e) => setT(k, k.startsWith('vida') ? e.target.value : milesInput(e.target.value))} className="campo num text-right" /></div>;
  const metodo = (k: 'metodoContable' | 'metodoTributario', l: string) => (
    <div><label className="etiqueta" htmlFor={`af-${k}`}>{l}</label><select id={`af-${k}`} value={form![k]} onChange={(e) => set({ [k]: e.target.value })} className="campo"><option value="lineal">Lineal (vida normal)</option><option value="acelerada">Acelerada (1/3 de la vida)</option></select></div>
  );
  const fecha = (k: 'fecha' | 'fechaInicioDepContable' | 'fechaInicioDepTributaria', l: string) => <div><label className="etiqueta" htmlFor={`af-${k}`}>{l}</label><input id={`af-${k}`} type="date" value={form![k]} onChange={(e) => set({ [k]: e.target.value })} className="campo" /></div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[['Valor de adquisición', tot.valor], ['Depreciación acumulada', tot.acum], ['Valor libro', tot.libro], [`Depreciación contable ${anio}`, tot.dep], [`Depreciación tributaria ${anio}`, tot.trib], ['Diferencia temporaria acumulada', tot.dif]].map(([l, v]) => (
          <div key={l as string} className="tarjeta p-3"><p className="text-[10px] text-tenue uppercase">{l}</p><p className="num text-base font-semibold">{clp(v as number)}</p></div>
        ))}
      </div>
      <Mensaje {...msg} />
      <div className="flex flex-wrap items-center gap-2">
        {escribe && !ed && <button type="button" className="boton" onClick={() => setEd({ id: null, f: vacio() })}>+ Activo fijo</button>}
        {escribe && tot.dep > 0 && (depreciacion
          ? <span className="text-sm text-tenue">✅ Depreciación {anio} contabilizada (asiento N° {depreciacion.numero}).</span>
          : <button type="button" className="boton-sec" disabled={pendiente} onClick={() => window.confirm(`¿Generar el asiento de depreciación ${anio} por ${clp(tot.dep)} al 31-12-${anio}?`) && run(() => contabilizarDepreciacion(empresaId, anio))}>📝 Contabilizar depreciación {anio} ({clp(tot.dep)})</button>)}
      </div>
      {ed && form && (
        <section className="tarjeta space-y-3 p-4 text-sm">
          <h2 className="font-semibold">{ed.id ? 'Editar activo' : 'Nuevo activo fijo'}</h2>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2"><label className="etiqueta" htmlFor="af-desc">Descripción</label><input id="af-desc" value={form.descripcion} onChange={(e) => set({ descripcion: e.target.value })} className="campo" /></div>
            <div><label className="etiqueta" htmlFor="af-cat">Categoría</label>
              <select id="af-cat" value={form.categoria} onChange={(e) => { const c = afCat(e.target.value); setEd((x) => x ? { ...x, f: { ...x.f, categoria: c.k, txt: { ...x.f.txt, vidaContable: String(c.vida), vidaTributaria: String(c.vida) } } } : x); }} className="campo">
                {AF_CATEGORIAS.map((c) => <option key={c.k} value={c.k}>{c.lbl} ({c.vida} años)</option>)}
              </select></div>
            {fecha('fecha', 'Fecha de compra')}
            <div className="sm:col-span-4"><label className="etiqueta" htmlFor="af-compra">Factura de compra (trazabilidad; no se contabiliza de nuevo)</label>
              <select id="af-compra" value={form.documentoId || ''} onChange={(e) => elegirCompra(e.target.value)} className="campo"><option value="">Sin documento vinculado</option>{compras.map((d) => <option key={d.id} value={d.id}>{d.rotulo} · {clp(d.base)}</option>)}</select></div>
          </div>
          <div className="grid gap-3 rounded-md border border-borde p-3 sm:grid-cols-5">
            <p className="font-medium sm:col-span-5">Contable (genera el asiento)</p>
            {num('valor', 'Valor')}{num('residual', 'Valor residual')}{num('vidaContable', 'Vida útil (años)')}{metodo('metodoContable', 'Método')}{fecha('fechaInicioDepContable', 'Inicio depreciación')}
          </div>
          <div className="grid gap-3 rounded-md border border-borde p-3 sm:grid-cols-5">
            <p className="font-medium sm:col-span-5">Tributaria (renta anual)</p>
            {num('valorTributario', 'Valor tributario')}{num('residualTributario', 'Residual tributario')}{num('vidaTributaria', 'Vida útil (años)')}{metodo('metodoTributario', 'Método')}{fecha('fechaInicioDepTributaria', 'Inicio depreciación')}
          </div>
          {prev && (
            <div className="rounded-md bg-panel-2/50 p-3 text-xs">
              <p>📐 Contable {anio}: base {clp(prev.c.base)} · {prev.c.metodo} {prev.c.vidaUsada} años · depreciación {clp(prev.c.deprEsteAnio)} · acumulada {clp(prev.c.acumulada)} · valor libro {clp(prev.c.valorLibro)}</p>
              <p>📐 Tributaria {anio}: base {clp(prev.t.base)} · {prev.t.metodo} {prev.t.vidaUsada} años · depreciación {clp(prev.t.deprEsteAnio)} · acumulada {clp(prev.t.acumulada)} · valor neto {clp(prev.t.valorLibro)}</p>
              <p className="text-tenue">Diferencia temporaria acumulada (tributaria − contable): {clp(prev.t.acumulada - prev.c.acumulada)}</p>
            </div>
          )}
          <div className="flex gap-2"><button type="button" className="boton" disabled={pendiente} onClick={guardar}>Guardar</button><button type="button" className="boton-sec" onClick={() => setEd(null)}>Cancelar</button></div>
        </section>
      )}
      <div className="tarjeta overflow-x-auto">
        <table className="w-full min-w-[960px] text-xs">
          <thead className="text-left text-tenue uppercase">
            <tr className="border-b border-borde"><th className="px-3 py-2">Bien</th><th className="px-2 py-2">Compra</th><th className="px-2 py-2">Método</th><th className="px-2 py-2 text-right">Valor</th><th className="px-2 py-2 text-right">Depr. {anio}</th><th className="px-2 py-2 text-right">Acumulada</th><th className="px-2 py-2 text-right">Valor libro</th><th className="px-2 py-2">Estado</th><th /></tr>
          </thead>
          <tbody>
            {calc.length === 0 && <tr><td colSpan={9} className="px-3 py-6 text-center text-tenue">No hay activos fijos registrados.</td></tr>}
            {calc.map(({ f, c, t }) => (
              <Fragment key={f.id}>
                <tr className="border-b border-borde/40">
                  <td className="px-3 py-1.5"><div className="font-medium">{f.descripcion}</div><div className="text-tenue">{afCat(f.categoria).lbl}{f.documentoId ? ' · 🔗 con factura' : ''}</div></td>
                  <td className="num px-2 py-1.5">{f.fecha.split('-').reverse().join('/')}</td>
                  <td className="px-2 py-1.5">C: {c.metodo === 'acelerada' ? 'acel.' : 'lineal'} {c.vidaUsada}a<div className="text-[10px] text-tenue">T: {t.metodo === 'acelerada' ? 'acel.' : 'normal'} {t.vidaUsada}a · dif. {clp(t.acumulada - c.acumulada)}</div></td>
                  <td className="num px-2 py-1.5 text-right">{clp(+(f.ficha.valorContable ?? f.ficha.valor ?? 0))}</td>
                  <td className="num px-2 py-1.5 text-right text-peligro">{clp(c.deprEsteAnio)}</td>
                  <td className="num px-2 py-1.5 text-right text-tenue">{clp(c.acumulada)}</td>
                  <td className="num px-2 py-1.5 text-right font-semibold">{clp(c.valorLibro)}</td>
                  <td className="px-2 py-1.5">{c.totalmenteDepreciado ? 'Depreciado' : c.deprEsteAnio > 0 ? 'Activo' : 'Sin iniciar'}</td>
                  <td className="space-x-2 px-3 py-1.5 text-right whitespace-nowrap">
                    {escribe && <button type="button" className="text-acento hover:underline" onClick={() => editar(f)}>Editar</button>}
                    {escribe && <button type="button" className="text-tenue hover:text-peligro" onClick={() => window.confirm(`¿Eliminar el activo "${f.descripcion}"?`) && run(() => eliminarActivo(empresaId, f.id))}>Eliminar</button>}
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-tenue">Cuentas por categoría: activo 1201002 a 1201006, depreciación acumulada 1201202 a 1201206 y gasto 3301002 a 3301006. Con fecha de inicio la depreciación se prorratea por meses; las fichas históricas sin fecha deprecian desde el año siguiente a la compra.</p>
    </div>
  );
}
