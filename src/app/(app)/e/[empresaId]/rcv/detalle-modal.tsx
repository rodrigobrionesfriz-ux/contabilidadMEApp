'use client';

import { useEffect, useState } from 'react';
import type { PlanCuentas } from '@/motor/plan-cuentas';
import { dteC, dteV } from '@/motor/dte';
import type { TipoRCV } from '@/rcv/leer';
import { lineasIniciales, validarDetalleRCV, type LineaDetalle } from '@/rcv/detalle';
import { EditorLineas, type CentroOpcion } from '@/components/editor-lineas';
import { clp, fechaCL } from '@/lib/formato';
import type { Fila } from './importador';

type Detalle = NonNullable<Fila['detalle']>;

export function DetalleModal({ tipo, plan, centros, filas, indice, seleccionables, onGuardar, onQuitar, onIr, onCerrar }: {
  tipo: TipoRCV; plan: PlanCuentas; centros: CentroOpcion[]; filas: Fila[]; indice: number; seleccionables: number[];
  onGuardar: (i: number, d: Detalle, vence: string) => void; onQuitar: (i: number) => void; onIr: (i: number) => void; onCerrar: () => void;
}) {
  const f = filas[indice];
  const inicial = (): Detalle => f.detalle ?? {
    lineas: lineasIniciales(tipo, { ...f.doc, cuenta: f.cuenta, cc: f.cc }), glosa: '', aceptaRedondeo: false,
  };
  const [d, setD] = useState<Detalle>(inicial);
  const [vence, setVence] = useState(f.vence);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onCerrar]);

  const v = validarDetalleRCV(tipo, f.doc, d.lineas, plan, { aceptaRedondeo: d.aceptaRedondeo });
  const pos = seleccionables.indexOf(indice);
  const siguiente = seleccionables[pos + 1];
  const anterior = seleccionables[pos - 1];
  const dte = (tipo === 'compra' ? dteC(f.doc.tipoDTE) : dteV(f.doc.tipoDTE))?.nm ?? `DTE ${f.doc.tipoDTE}`;
  const guardar = (ir?: number) => {
    if (!v.ok) return;
    onGuardar(indice, { ...d, lineas: d.lineas.map((l) => ({ ...l, desc: (l.desc ?? '').trim() })), glosa: d.glosa.trim() }, vence);
    if (ir !== undefined) onIr(ir); else onCerrar();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-velo p-2 sm:p-6" role="dialog" aria-modal="true" aria-label="Detalle del documento">
      <div className="tarjeta w-full max-w-5xl space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs text-tenue uppercase">Paso 2 · documento {pos + 1} de {seleccionables.length}</div>
            <h2 className="text-lg font-semibold">{dte} N° {f.doc.numero}</h2>
            <div className="text-sm text-tenue">{f.doc.razonSocial} · <span className="num">{f.doc.rutCodigo}-{f.doc.rutDV}</span> · emitido {fechaCL(f.doc.fecha)}</div>
          </div>
          <button type="button" onClick={onCerrar} className="text-tenue hover:text-texto" aria-label="Cerrar">✕</button>
        </div>
        <div className="grid gap-2 text-xs sm:grid-cols-5">
          {([['Exento', f.doc.exento], ['Neto', f.doc.neto], ['IVA', f.doc.iva], ['Otros imp.', f.doc.otrosImpuestos], ['Total', f.doc.total]] as const).map(([t, m]) => (
            <div key={t} className="rounded-md bg-panel-2 px-3 py-2"><div className="text-tenue uppercase">{t}</div><div className="num font-semibold">{clp(m)}</div></div>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
          <div>
            <label className="etiqueta" htmlFor="glosa-doc">Glosa del documento</label>
            <input id="glosa-doc" value={d.glosa} onChange={(e) => setD({ ...d, glosa: e.target.value })} className="campo" placeholder="Ej: Combustible tractores temporada" />
          </div>
          <div>
            <label className="etiqueta" htmlFor="vence">Vencimiento</label>
            <input id="vence" type="date" value={vence} onChange={(e) => setVence(e.target.value)} className="campo" />
          </div>
        </div>
        <EditorLineas tipo={tipo} doc={f.doc} lineas={d.lineas} onChange={(lineas: LineaDetalle[]) => setD({ ...d, lineas })}
          plan={plan} centros={centros} listaId="cuentas-rcv" validacion={v} />
        <label className="flex items-center gap-2 text-xs text-tenue">
          <input type="checkbox" checked={d.aceptaRedondeo} onChange={(e) => setD({ ...d, aceptaRedondeo: e.target.checked })} />
          Aceptar diferencia de $1 (redondeo del emisor)
        </label>
        <div className="flex flex-wrap items-center gap-2 border-t border-borde pt-3">
          <button type="button" className="boton-sec" disabled={anterior === undefined} onClick={() => onIr(anterior)}>← Anterior</button>
          <button type="button" className="boton-sec" disabled={siguiente === undefined} onClick={() => onIr(siguiente)}>Siguiente →</button>
          <span className="flex-1" />
          {f.detalle && <button type="button" className="text-xs text-tenue hover:text-peligro" onClick={() => { onQuitar(indice); onCerrar(); }}>Volver a cuenta única</button>}
          <button type="button" className="boton-sec" disabled={!v.ok} onClick={() => guardar()}>Guardar</button>
          <button type="button" className="boton" disabled={!v.ok || siguiente === undefined} onClick={() => guardar(siguiente)}>Guardar y siguiente</button>
        </div>
      </div>
    </div>
  );
}
