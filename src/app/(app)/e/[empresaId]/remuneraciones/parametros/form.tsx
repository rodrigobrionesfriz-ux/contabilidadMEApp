'use client';

import { useState, useTransition } from 'react';
import { decimalCL, decimalTexto, decimalInput } from '@/lib/formato';
import type { Parametros, Institucion } from '@/remuneraciones/parametros';
import { Mensaje } from '@/components/form-estado';
import { guardarParametros } from '../acciones';

const IND: [string, string][] = [
  ['uf', 'UF de referencia'], ['utm', 'UTM de referencia'], ['ingresoMinimo', 'Ingreso mínimo mensual'],
  ['topeAFP_UF', 'Tope imponible AFP/salud (UF)'], ['topeCesantia_UF', 'Tope seguro cesantía (UF)'],
  ['tasaAFP', '% cotización AFP (sin comisión)'], ['tasaSalud', '% salud'], ['gratifPct', '% gratificación legal'], ['gratifTopeIMM', 'Tope gratificación (IMM al año)'],
  ['asigFamA_hasta', 'Asig. familiar A: renta hasta'], ['asigFamA_monto', 'Asig. familiar A: monto'],
  ['asigFamB_hasta', 'Asig. familiar B: renta hasta'], ['asigFamB_monto', 'Asig. familiar B: monto'],
  ['asigFamC_hasta', 'Asig. familiar C: renta hasta'], ['asigFamC_monto', 'Asig. familiar C: monto'],
  ['rentaMinimaEspecial', 'Renta mínima menores 18 / mayores 65'], ['rentaMinimaCasa', 'Renta mínima casa particular'],
  ['tpPesadoEmp', '% trabajo pesado empleador'], ['tpPesadoTrab', '% trabajo pesado trabajador'], ['tpMenosEmp', '% menos pesado empleador'], ['tpMenosTrab', '% menos pesado trabajador'],
];
const PAT: [string, string][] = [
  ['sis', '% SIS'], ['mutualBase', '% mutual básica'], ['mutualAdicional', '% mutual adicional'], ['mutualSanna', '% Ley SANNA (mutual)'], ['mutualExtra', '% mutual extraordinaria'],
  ['islBase', '% ISL básica'], ['islAdicional', '% ISL adicional'], ['islSanna', '% Ley SANNA (ISL)'],
  ['afcIndefinido', '% AFC empleador indefinido'], ['afcTrabIndefinido', '% AFC trabajador indefinido'], ['afcPlazoFijo', '% AFC empleador plazo fijo'],
  ['afcIndef11', '% AFC empleador +11 años'], ['cajaCompensacion', '% caja de compensación'],
];

export function FormParametros({ empresaId, P, editable }: { empresaId: string; P: Parametros; editable: boolean }) {
  const [ind, setInd] = useState<Record<string, string>>(Object.fromEntries(IND.map(([k]) => [k, P.ind[k] ? decimalInput(P.ind[k] as number) : ''])));
  const [pat, setPat] = useState<Record<string, string>>(Object.fromEntries([...PAT.map(([k]) => [k, P.patronal[k] ? decimalInput(P.patronal[k] as number) : '']), ['mutualInstitucion', String(P.patronal.mutualInstitucion)], ['cajaInstitucion', String(P.patronal.cajaInstitucion)]]));
  const [afps, setAfps] = useState<Institucion[]>(P.afps.map((a) => ({ ...a })));
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pendiente, iniciar] = useTransition();
  const n = (v: string) => decimalCL(v);
  const guardar = () => iniciar(async () => {
    const r = await guardarParametros(empresaId, {
      indicadores: Object.fromEntries(Object.entries(ind).map(([k, v]) => [k, n(v)])),
      previsional: { afps: afps.map((a) => ({ ...a, comision: n(String(a.comision)) })), patronal: { ...P.patronal, ...Object.fromEntries(Object.entries(pat).map(([k, v]) => [k, k.endsWith('Institucion') ? v : n(v)])) } },
    });
    setMsg(r.ok ? { ok: r.mensaje } : { error: r.error });
  });
  const campo = (k: string, l: string, obj: Record<string, string>, set: (x: Record<string, string>) => void) => (
    <div key={k}><label className="etiqueta" htmlFor={`p-${k}`}>{l}</label>
      <input id={`p-${k}`} disabled={!editable} value={obj[k] ?? ''} onChange={(e) => set({ ...obj, [k]: decimalInput(e.target.value) })} className="campo num text-right" /></div>
  );
  return (
    <div className="space-y-4">
      {!editable && <p className="text-sm text-tenue">Sólo un administrador puede modificar los parámetros.</p>}
      <section className="tarjeta grid gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
        <h2 className="font-semibold sm:col-span-3 lg:col-span-4">Indicadores</h2>
        {IND.map(([k, l]) => campo(k, l, ind, setInd))}
      </section>
      <section className="tarjeta grid gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
        <h2 className="font-semibold sm:col-span-3 lg:col-span-4">Aportes del empleador</h2>
        <div><label className="etiqueta" htmlFor="p-mut">Seguro de accidentes</label>
          <select id="p-mut" disabled={!editable} value={pat.mutualInstitucion} onChange={(e) => setPat({ ...pat, mutualInstitucion: e.target.value })} className="campo">
            {P.mutuales.map((m) => <option key={m.k} value={m.k}>{m.nm}</option>)}
          </select></div>
        <div><label className="etiqueta" htmlFor="p-caja">Caja de compensación</label>
          <select id="p-caja" disabled={!editable} value={pat.cajaInstitucion} onChange={(e) => setPat({ ...pat, cajaInstitucion: e.target.value })} className="campo">
            {P.cajas.map((m) => <option key={m.k} value={m.k}>{m.nm}</option>)}
          </select></div>
        {PAT.map(([k, l]) => campo(k, l, pat, setPat))}
      </section>
      <section className="tarjeta p-4">
        <h2 className="mb-2 font-semibold">Comisión de las AFP (%)</h2>
        <div className="grid gap-2 sm:grid-cols-4">
          {afps.map((a, i) => (
            <div key={a.k}><label className="etiqueta" htmlFor={`afp-${a.k}`}>{a.nm}</label>
              <input id={`afp-${a.k}`} disabled={!editable} value={typeof a.comision === 'number' ? decimalTexto(a.comision) : String(a.comision ?? '')} onChange={(e) => setAfps(afps.map((x, j) => (j === i ? { ...x, comision: e.target.value as unknown as number } : x)))} className="campo num text-right" /></div>
          ))}
        </div>
      </section>
      {editable && <div className="flex items-center gap-3"><button type="button" className="boton" disabled={pendiente} onClick={guardar}>{pendiente ? 'Guardando…' : 'Guardar parámetros'}</button><Mensaje {...msg} /></div>}
    </div>
  );
}
