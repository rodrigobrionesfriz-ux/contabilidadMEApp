'use client';

import { tipoLinea, completarLinea, type LineaDetalle, type DocParaDetalle, type ResultadoValidacion } from '@/rcv/detalle';
import type { PlanCuentas } from '@/motor/plan-cuentas';
import type { TipoRCV } from '@/rcv/leer';
import { clp, milesInput } from '@/lib/formato';

export interface CentroOpcion { codigo: string; nombre: string; nivel: number; padre: string | null }

/** Lista de cuentas imputables para <datalist> (una sola por página). */
export function ListaCuentas({ id, plan, cuentas }: { id: string; plan: PlanCuentas; cuentas: { cd: string; nm: string }[] }) {
  return (
    <datalist id={id}>
      {cuentas.filter((c) => plan.regla(c.cd)?.aceptaMovimientos && plan.regla(c.cd)?.activa).map((c) => <option key={c.cd} value={`${c.cd} · ${c.nm}`} />)}
    </datalist>
  );
}

export const codigoDe = (v: string) => v.split(' ')[0].replace(/[^0-9]/g, '');

export function SelectorCC({ valor, onChange, centros, deshabilitado, requerido, etiqueta }: {
  valor: string; onChange: (v: string) => void; centros: CentroOpcion[]; deshabilitado?: boolean; requerido?: boolean; etiqueta?: string;
}) {
  const principales = centros.filter((c) => c.nivel === 1);
  return (
    <select value={valor} disabled={deshabilitado} onChange={(e) => onChange(e.target.value)} className="campo py-1 text-xs" aria-label={etiqueta ?? 'Centro de costo'}>
      <option value="">{deshabilitado ? 'No admite CC' : requerido ? 'Centro de costo *' : 'Sin centro de costo'}</option>
      {/* Un valor que no está en la lista (p. ej. un id del sistema anterior) se muestra en vez de esconderse */}
      {valor && !centros.some((c) => c.codigo === valor) && <option value={valor}>⚠️ {valor} (no existe)</option>}
      {principales.map((p) => {
        const hijos = centros.filter((c) => c.padre === p.codigo);
        if (!hijos.length) return <option key={p.codigo} value={p.codigo}>{p.nombre}</option>;
        return (
          <optgroup key={p.codigo} label={p.nombre}>
            <option value={p.codigo}>{p.nombre} (general)</option>
            {hijos.map((h) => <option key={h.codigo} value={h.codigo}>{h.nombre}</option>)}
          </optgroup>
        );
      })}
    </select>
  );
}

export function EditorLineas({ tipo, doc, lineas, onChange, plan, centros, listaId, validacion, placeholderDesc }: {
  tipo: TipoRCV; doc: DocParaDetalle; lineas: LineaDetalle[]; onChange: (l: LineaDetalle[]) => void;
  plan: PlanCuentas; centros: CentroOpcion[]; listaId: string; validacion: ResultadoValidacion;
  /** Texto de ayuda en la descripción de las líneas de gasto/ingreso (no en las de otros impuestos) */
  placeholderDesc?: string;
}) {
  const set = (i: number, cambios: Partial<LineaDetalle>) => onChange(lineas.map((l, j) => (j === i ? { ...l, ...cambios } : l)));
  const cambiarTipo = (i: number, t: string) => set(i, { afecto: t === 'afecto', otroImp: t === 'otro' || undefined });
  const r = validacion.resumen as Record<string, number>;
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border border-borde">
        <table className="w-full min-w-[820px] text-xs">
          <thead className="text-left text-tenue uppercase">
            <tr className="border-b border-borde">
              <th className="px-2 py-1.5">Cuenta</th><th className="px-2 py-1.5">Descripción</th><th className="w-32 px-2 py-1.5">Monto</th>
              <th className="w-48 px-2 py-1.5">Centro de costo</th><th className="w-32 px-2 py-1.5">Tipo</th><th className="w-14" />
            </tr>
          </thead>
          <tbody>
            {lineas.map((l, i) => {
              const regla = plan.regla(l.cuenta);
              return (
                <tr key={i} className="border-b border-borde/50 align-top">
                  <td className="px-2 py-1">
                    <input list={listaId} value={l.cuenta} onChange={(e) => set(i, { cuenta: codigoDe(e.target.value) || e.target.value })}
                      className="campo num py-1" placeholder="Cuenta" aria-label={`Cuenta línea ${i + 1}`} />
                    <div className="mt-0.5 truncate text-[11px] text-tenue">{regla ? plan.nombre(l.cuenta) : l.cuenta ? '⚠️ no existe' : ''}</div>
                  </td>
                  <td className="px-2 py-1"><input value={l.desc ?? ''} onChange={(e) => set(i, { desc: e.target.value })} placeholder={l.otroImp ? '' : placeholderDesc} className="campo py-1" aria-label={`Descripción línea ${i + 1}`} /></td>
                  <td className="px-2 py-1">
                    <div className="flex gap-1">
                      <input inputMode="numeric" maxLength={13} value={l.monto ? milesInput(l.monto) : ''} onChange={(e) => set(i, { monto: Math.round(Number(e.target.value.replace(/[^0-9]/g, '').slice(0, 10)) || 0) })}
                        className="campo num py-1 text-right" aria-label={`Monto línea ${i + 1}`} />
                      <button type="button" title="Completar con lo que falta" className="text-tenue hover:text-acento" onClick={() => set(i, { monto: completarLinea(tipo, doc, lineas, i) })}>⇥</button>
                    </div>
                  </td>
                  <td className="px-2 py-1">
                    <SelectorCC valor={l.cc ?? ''} onChange={(v) => set(i, { cc: v })} centros={centros}
                      deshabilitado={!!regla && !regla.aceptaCentroCosto && !l.cc} requerido={regla?.requiereCentroCosto} />
                  </td>
                  <td className="px-2 py-1">
                    <select value={tipoLinea(l)} onChange={(e) => cambiarTipo(i, e.target.value)} className="campo py-1 text-xs" aria-label={`Tipo línea ${i + 1}`}>
                      <option value="afecto">Afecto</option><option value="exento">Exento</option>
                      {tipo === 'compra' && <option value="otro">Otro impuesto</option>}
                    </select>
                  </td>
                  <td className="px-2 py-1 text-center">
                    {lineas.length > 1 && <button type="button" className="text-tenue hover:text-peligro" aria-label="Quitar línea" onClick={() => onChange(lineas.filter((_, j) => j !== i))}>✕</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <button type="button" className="boton-sec py-1 text-xs"
          onClick={() => onChange([...lineas, { cuenta: lineas[0]?.cuenta ?? '', desc: '', monto: 0, cc: lineas[0]?.cc ?? '', afecto: true }])} title="Agregar otra línea para repartir en otra cuenta o centro de costo">+ Línea (otra cuenta o centro)</button>
        <div className="num flex flex-wrap gap-x-4 text-tenue">
          <span>Afecto {clp(r.sumAfecto)} / {clp(r.neto)}</span>
          <span>Exento {clp(r.sumExento)} / {clp(r.exento)}</span>
          <span>IVA {clp(r.ivaCalc)} / {clp(r.iva)}</span>
          {tipo === 'compra' && <span>Otros {clp(r.sumOtros)} / {clp(r.otros)}</span>}
          <span>Total {clp(r.totalCalc)} / {clp(r.total)}</span>
        </div>
      </div>
      {validacion.ok ? (
        <p className="text-xs text-acento">✓ Cuadra con el documento.</p>
      ) : (
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-peligro">{validacion.errores.map((e, i) => <li key={i}>{e}</li>)}</ul>
      )}
      {validacion.avisos.length > 0 && <ul className="list-disc pl-5 text-xs text-aviso">{validacion.avisos.map((e, i) => <li key={i}>{e}</li>)}</ul>}
    </div>
  );
}
