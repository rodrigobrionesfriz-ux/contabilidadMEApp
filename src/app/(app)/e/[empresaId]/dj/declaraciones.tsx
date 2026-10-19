'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { regimenInfo } from '@/estados/regimenes';
import {
  aplicaA, plazoLbl, fechaLbl, diasParaVencer, djNueva, filasExcelDJ, estadoVacio,
  ESTADOS_DJ, FUENTES, REG_DJ, type DJ, type EstadoDJ, type Resumen,
} from '@/tributario/dj';
import { Mensaje } from '@/components/form-estado';
import { guardarEstadoDJ, guardarDJ, borrarDJ, restaurarCatalogoDJ } from './acciones';

export function Declaraciones({ empresaId, anio, at, regimen, catalogo, propio, estados, resumenes, empresa, escribe, hoy }: {
  empresaId: string; anio: number; at: number; regimen: string; catalogo: DJ[]; propio: boolean; estados: Record<string, EstadoDJ>;
  resumenes: Record<string, Resumen | null>; empresa: { nombre: string; rut: string }; escribe: boolean; hoy: string;
}) {
  const router = useRouter();
  const [verTodas, setVerTodas] = useState(false);
  const [edit, setEdit] = useState<{ orig: string | null; dj: DJ } | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pendiente, iniciar] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; mensaje?: string; error?: string }>, cerrar = false) => iniciar(async () => {
    const r = await fn(); setMsg(r.ok ? { ok: r.mensaje } : { error: r.error }); if (r.ok) { if (cerrar) setEdit(null); router.refresh(); }
  });
  const reg = regimenInfo(regimen);
  const propias = catalogo.filter((d) => aplicaA(d, regimen));
  const otras = catalogo.filter((d) => !aplicaA(d, regimen));
  const lista = verTodas ? catalogo : propias;
  const est = (n: string) => estados[n] || estadoVacio();
  const sinPresentar = propias.filter((d) => !['presentada', 'noaplica'].includes(est(d.n).estado)).length;

  const exportar = async () => {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet(filasExcelDJ(lista, estados, at, { ...empresa, anio, regimenLbl: `${reg.corto} · ${reg.nm}` }, regimen));
    ws['!cols'] = [{ wch: 8 }, { wch: 46 }, { wch: 8 }, { wch: 26 }, { wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 40 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DJ AT' + at);
    XLSX.writeFile(wb, `declaraciones_juradas_AT${at}_${empresa.rut.replace(/[^0-9kK]/g, '')}.xlsx`);
  };
  const setEstado = (n: string, c: Partial<EstadoDJ>) => run(() => guardarEstadoDJ(empresaId, at, n, c, hoy));

  return (
    <div className="space-y-4">
      <section className="tarjeta flex flex-wrap items-start justify-between gap-4 p-4 text-sm">
        <div className="max-w-3xl">
          <p className="text-xs text-tenue">📋 Declaraciones juradas del régimen <strong>{reg.corto}</strong> según la Resolución Ex. SII N°123 de 25-09-2025. Se presentan en sii.cl; aquí se controla el cumplimiento y se preparan las cifras. El catálogo es editable: si el SII cambia un plazo o agrega una declaración, se ajusta desde aquí.{propio && ' Esta empresa usa un catálogo editado.'}</p>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-tenue uppercase">Le corresponden</div>
          <div className="num text-2xl font-semibold text-acento">{propias.length}</div>
          <div className={`text-[11px] ${sinPresentar ? 'text-aviso' : 'text-acento'}`}>{sinPresentar ? `${sinPresentar} sin presentar` : 'todas al día'}</div>
        </div>
      </section>

      <div className="no-print flex flex-wrap items-center gap-2 text-sm">
        <button type="button" className={verTodas ? 'boton-sec' : 'boton'} onClick={() => setVerTodas(false)}>Las de mi régimen ({propias.length})</button>
        <button type="button" className={verTodas ? 'boton' : 'boton-sec'} onClick={() => setVerTodas(true)}>Todo el catálogo ({catalogo.length})</button>
        <span className="flex-1" />
        {escribe && <button type="button" className="boton-sec" onClick={() => setEdit({ orig: null, dj: djNueva() })}>+ Agregar declaración</button>}
        <button type="button" className="boton-sec" onClick={exportar}>📊 Exportar</button>
        {escribe && propio && <button type="button" className="boton-sec" title="Descarta los cambios y vuelve al listado oficial que trae el sistema" disabled={pendiente}
          onClick={() => confirm('¿Volver al catálogo oficial que trae el sistema?\n\nSe descartan los cambios hechos al listado (plazos, nombres, regímenes) y las declaraciones agregadas.\n\nEl estado de presentación de cada año NO se toca.') && run(() => restaurarCatalogoDJ(empresaId))}>↺ Catálogo oficial</button>}
      </div>
      <Mensaje {...msg} />

      {edit && <Editor edit={edit} setEdit={setEdit} pendiente={pendiente} guardar={() => run(() => guardarDJ(empresaId, at, edit.orig, edit.dj), true)} />}

      {lista.length ? lista.map((d) => {
        const st = est(d.n);
        const aplica = aplicaA(d, regimen);
        const dias = aplica && !['presentada', 'noaplica'].includes(st.estado) ? diasParaVencer(d, at, hoy) : null;
        const resumen = d.fuente ? resumenes[d.fuente] : null;
        return (
          <section key={d.n} className={`tarjeta space-y-3 p-4 text-sm ${aplica ? '' : 'opacity-60'}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 font-semibold">
                  <span className="num rounded bg-panel-2 px-1.5 text-acento">N°{d.n}</span><span>{d.nm}</span>
                  {d.propia && <span className="rounded border border-borde px-1.5 text-[10px] text-tenue">propia</span>}
                  {!aplica && <span className="rounded border border-borde px-1.5 text-[10px] text-tenue">otro régimen</span>}
                </div>
                <p className="mt-1 text-xs text-tenue">{d.desc}</p>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  <span>📅 Vence el <strong>{plazoLbl(d, at)}</strong>{d.plazoTxt && d.plazo && <span className="text-tenue"> (el aviso se cuenta al {fechaLbl(d, at)})</span>}</span>
                  {d.cert && <span>· 📄 {d.cert}</span>}
                  {d.fuente && FUENTES[d.fuente] && <span>· 🔗 {FUENTES[d.fuente]}</span>}
                  {dias != null && dias < 0 && <span className="rounded bg-peligro/15 px-1.5 text-peligro">Venció hace {-dias} día(s)</span>}
                  {dias != null && dias >= 0 && dias <= 15 && <span className="rounded bg-aviso/15 px-1.5 text-aviso">Vence en {dias} día(s)</span>}
                </div>
                {d.nota && <p className="mt-1 text-xs text-aviso">⚠ {d.nota}</p>}
              </div>
              <div className="flex items-center gap-2">
                <select aria-label={`Estado de la N°${d.n}`} className={`campo w-36 ${(ESTADOS_DJ[st.estado] || ESTADOS_DJ.pendiente).tono}`} value={st.estado} disabled={!escribe || pendiente}
                  onChange={(e) => setEstado(d.n, { estado: e.target.value })}>
                  {Object.entries(ESTADOS_DJ).map(([k, v]) => <option key={k} value={k}>{v.lbl}</option>)}
                </select>
                {escribe && <button type="button" className="boton-sec" title="Editar esta declaración" onClick={() => setEdit({ orig: d.n, dj: { ...djNueva(), ...d } })}>✏️</button>}
                {escribe && d.propia && <button type="button" className="boton-sec" title="Quitar del catálogo"
                  onClick={() => confirm(`¿Quitar la declaración N°${d.n} del catálogo?`) && run(() => borrarDJ(empresaId, d.n))}>🗑</button>}
              </div>
            </div>
            {(st.estado === 'presentada' || st.estado === 'preparada') && (
              <div className="grid gap-2 sm:grid-cols-[10rem_12rem_1fr]">
                <div><label className="etiqueta" htmlFor={`f-${d.n}`}>Fecha de presentación</label>
                  <input key={st.fecha} id={`f-${d.n}`} type="date" className="campo" defaultValue={st.fecha} disabled={!escribe} onBlur={(e) => e.target.value !== st.fecha && setEstado(d.n, { fecha: e.target.value })} /></div>
                <div><label className="etiqueta" htmlFor={`fo-${d.n}`}>Folio o comprobante</label>
                  <input key={st.folio} id={`fo-${d.n}`} className="campo" defaultValue={st.folio} placeholder="N° de folio del SII" disabled={!escribe} onBlur={(e) => e.target.value !== st.folio && setEstado(d.n, { folio: e.target.value })} /></div>
                <div><label className="etiqueta" htmlFor={`o-${d.n}`}>Observaciones</label>
                  <input key={st.obs} id={`o-${d.n}`} className="campo" defaultValue={st.obs} placeholder="Diferencias, rectificatorias, pendientes…" disabled={!escribe} onBlur={(e) => e.target.value !== st.obs && setEstado(d.n, { obs: e.target.value })} /></div>
              </div>
            )}
            {resumen ? (
              <div className="rounded-md border border-borde p-3">
                <div className="mb-1 text-[11px] font-semibold tracking-wide text-tenue uppercase">Lo que registra el sistema</div>
                <table className="w-full max-w-md text-xs"><tbody>{resumen.lineas.map(([k, v]) => <tr key={k}><td className="py-0.5">{k}</td><td className="num text-right">{v}</td></tr>)}</tbody></table>
                <p className="mt-1 text-[11px] text-tenue">Cifras de control para contrastar con el portal del SII, no el archivo que se sube.{resumen.ir && <> <Link className="text-acento hover:underline" href={`/e/${empresaId}/${resumen.ir}?anio=${anio}`}>Ver el detalle →</Link></>}</p>
              </div>
            ) : d.fuente ? <p className="text-[11px] text-tenue">Sin datos en el ejercicio {anio} para resumir esta declaración.</p> : null}
          </section>
        );
      }) : <p className="tarjeta p-6 text-center text-tenue">No hay declaraciones en el catálogo.</p>}

      {!verTodas && otras.length > 0 && <p className="border-t border-borde pt-3 text-xs text-tenue">Hay {otras.length} declaración(es) más en el catálogo que no aplican al régimen {reg.corto}: {otras.map((d) => 'N°' + d.n).join(', ')}.</p>}
    </div>
  );
}

function Editor({ edit, setEdit, guardar, pendiente }: { edit: { orig: string | null; dj: DJ }; setEdit: (e: { orig: string | null; dj: DJ } | null) => void; guardar: () => void; pendiente: boolean }) {
  const d = edit.dj;
  const set = (c: Partial<DJ>) => setEdit({ ...edit, dj: { ...d, ...c } });
  const campo = (k: 'n' | 'plazo' | 'nm' | 'desc' | 'plazoTxt' | 'cert' | 'nota', lbl: string, ph = '', ancho = '') => (
    <div className={ancho}><label className="etiqueta" htmlFor={`dje-${k}`}>{lbl}</label><input id={`dje-${k}`} className="campo" value={d[k] || ''} placeholder={ph} onChange={(e) => set({ [k]: e.target.value })} /></div>
  );
  return (
    <section className="tarjeta space-y-3 border-acento/50 p-4 text-sm">
      <h2 className="font-semibold">{edit.orig == null ? 'Nueva declaración' : `Editar N°${edit.orig}`}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {campo('n', 'Número de formulario', 'Ej: 1948')}
        {campo('plazo', 'Vence el (mes-día)', '03-27')}
        {campo('nm', 'Nombre', 'Retiros, remesas y dividendos', 'sm:col-span-2')}
        {campo('desc', 'Qué informa', '', 'sm:col-span-2')}
        {campo('plazoTxt', 'Plazo en palabras (opcional, si no es una sola fecha)', 'Junto con el Formulario 22', 'sm:col-span-2')}
        {campo('cert', 'Certificado asociado', 'Certificado N°70')}
        <div><label className="etiqueta" htmlFor="dje-fuente">Datos del sistema</label>
          <select id="dje-fuente" className="campo" value={d.fuente || ''} onChange={(e) => set({ fuente: e.target.value })}>
            <option value="">Sin resumen automático</option>{Object.entries(FUENTES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></div>
        {campo('nota', 'Nota o condición', 'Sólo si hubo trabajadores en el ejercicio', 'sm:col-span-2')}
      </div>
      <fieldset><legend className="etiqueta">Regímenes a los que aplica</legend>
        <div className="flex flex-wrap gap-3">{REG_DJ.map(([k, l]) => (
          <label key={k} className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={d.regimenes.includes(k)} onChange={(e) => set({ regimenes: e.target.checked ? [...d.regimenes, k] : d.regimenes.filter((x) => x !== k) })} />{l}</label>
        ))}</div>
      </fieldset>
      <div className="flex gap-2"><button type="button" className="boton" disabled={pendiente} onClick={guardar}>💾 Guardar</button><button type="button" className="boton-sec" onClick={() => setEdit(null)}>Cancelar</button></div>
    </section>
  );
}
