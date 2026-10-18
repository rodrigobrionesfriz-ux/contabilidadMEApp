'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { MARCADORES_CONTRATO, PLANTILLAS_CONTRATO_TIPO, validarPlantilla, type PlantillaContrato } from '@/remuneraciones/contrato-trabajo';
import { TIPOS_CONTRATO } from '@/remuneraciones/contrato-dt';
import { descargarDocx } from '@/lib/docx';
import { leerArchivoTexto } from '@/lib/leer-texto';
import { Mensaje } from '@/components/form-estado';
import { guardarPlantillaContrato, eliminarPlantillaContrato } from '../acciones';
import { slug } from '../descargas';

interface Edicion { uuid?: string; codigo?: string; nombre: string; cargos: string; tipoContrato: number | ''; texto: string; original: string | null; desdeWord?: string }

export function PlantillasContrato({ empresaId, lista, escribe }: { empresaId: string; lista: PlantillaContrato[]; escribe: boolean }) {
  const router = useRouter();
  const [ed, setEd] = useState<Edicion | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pendiente, iniciar] = useTransition();
  const v = ed ? validarPlantilla(ed.texto, ed.original) : null;
  const run = (f: () => Promise<{ ok: boolean; mensaje?: string; error?: string }>) => iniciar(async () => {
    const r = await f(); setMsg(r.ok ? { ok: r.mensaje } : { error: r.error }); if (r.ok) { setEd(null); router.refresh(); }
  });
  const editar = (p: PlantillaContrato) => setEd({ uuid: p.uuid, codigo: p.id, nombre: p.nombre, cargos: p.cargos || '', tipoContrato: p.tipoContrato || '', texto: p.texto, original: p.texto });
  const bajarWord = (nombre: string, texto: string) => iniciar(async () => {
    try { await descargarDocx(texto, `plantilla_contrato_${slug(nombre)}.docx`, { titulo: nombre, asunto: 'Plantilla de contrato · no borres ni cambies los textos entre {{ }}' }); setMsg({ ok: 'Plantilla descargada. Edítala en Word sin cambiar los {{marcadores}} (en amarillo) y súbela con «Subir Word».' }); }
    catch (e) { setMsg({ error: e instanceof Error ? e.message : String(e) }); }
  });
  const subirWord = async (file: File | undefined, p: PlantillaContrato | null) => {
    if (!file) return;
    try {
      const txt = (await leerArchivoTexto(file)).trim();
      if (!txt) { setMsg({ error: 'El archivo no tiene texto.' }); return; }
      const nuevo: Edicion = p ? { uuid: p.uuid, codigo: p.id, nombre: p.nombre, cargos: p.cargos || '', tipoContrato: p.tipoContrato || '', texto: txt, original: p.texto, desdeWord: file.name }
        : { nombre: file.name.replace(/\.[^.]+$/, ''), cargos: '', tipoContrato: '', texto: txt, original: null, desdeWord: file.name };
      setEd(nuevo);
      const r = validarPlantilla(txt, nuevo.original);
      setMsg(!r.ok ? { error: `El Word tiene ${r.errores.length} marcador(es) dañado(s): corrígelos antes de guardar.` } : { ok: r.avisos.length ? 'Word cargado: revisa los avisos y guarda.' : 'Word cargado: marcadores intactos. Revisa y guarda.' });
    } catch (e) { setMsg({ error: e instanceof Error ? e.message : String(e) }); }
  };
  const esTipo = (codigo?: string) => !!codigo && PLANTILLAS_CONTRATO_TIPO.some((x) => x.id === codigo);
  return (
    <div className="space-y-4">
      <Mensaje {...msg} />
      <div className="tarjeta overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-tenue uppercase"><tr className="border-b border-borde"><th className="px-3 py-2">Plantilla</th><th className="px-2 py-2">Cargos</th><th className="px-2 py-2">Contrato</th><th className="px-2 py-2">Tipo</th><th /></tr></thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.id} className="border-b border-borde/40">
                <td className="px-3 py-1.5 font-medium">{p.nombre}</td>
                <td className="px-2 py-1.5">{p.cargos || <span className="text-tenue">Cualquiera</span>}</td>
                <td className="px-2 py-1.5">{TIPOS_CONTRATO.find(([k]) => k === +p.tipoContrato)?.[1] || 'Cualquiera'}</td>
                <td className="px-2 py-1.5">{p.tipo ? (p.editada ? 'Tipo (editada)' : 'Tipo') : 'Propia'}</td>
                <td className="space-x-3 px-3 py-1.5 text-right whitespace-nowrap">
                  <button type="button" className="text-tenue hover:text-texto" onClick={() => bajarWord(p.nombre, p.texto)}>⬇️ Word</button>
                  {escribe && <label className="cursor-pointer text-tenue hover:text-texto">📤 Subir Word<input type="file" accept=".docx,.txt,.md,.html" className="sr-only" aria-label={`Subir Word ${p.nombre}`} onChange={(e) => { subirWord(e.target.files?.[0], p); e.target.value = ''; }} /></label>}
                  {escribe && <button type="button" className="text-acento hover:underline" onClick={() => editar(p)}>Editar</button>}
                  {escribe && <button type="button" className="text-tenue hover:text-texto" onClick={() => setEd({ nombre: `${p.nombre} (copia)`, cargos: p.cargos || '', tipoContrato: p.tipoContrato || '', texto: p.texto, original: null })}>Duplicar</button>}
                  {escribe && p.uuid && <button type="button" className="text-tenue hover:text-peligro" onClick={() => window.confirm(p.tipo ? '¿Restaurar el texto original de esta plantilla tipo?' : '¿Eliminar esta plantilla?') && run(() => eliminarPlantillaContrato(empresaId, p.uuid!))}>{p.tipo ? 'Restaurar' : 'Eliminar'}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {escribe && !ed && (
        <div className="flex gap-2">
          <button type="button" className="boton-sec" onClick={() => setEd({ nombre: '', cargos: '', tipoContrato: '', texto: PLANTILLAS_CONTRATO_TIPO[0].texto, original: null })}>+ Nueva plantilla</button>
          <label className="boton-sec cursor-pointer">📤 Nueva desde Word<input type="file" accept=".docx,.txt,.md,.html" className="sr-only" onChange={(e) => { subirWord(e.target.files?.[0], null); e.target.value = ''; }} /></label>
        </div>
      )}
      {ed && v && (
        <section className="tarjeta space-y-3 p-4 text-sm">
          {ed.desdeWord && <p className="text-xs text-tenue">Texto cargado desde {ed.desdeWord}.</p>}
          <div className="grid gap-3 sm:grid-cols-3">
            <div><label className="etiqueta" htmlFor="cp-nombre">Nombre</label><input id="cp-nombre" value={ed.nombre} onChange={(e) => setEd({ ...ed, nombre: e.target.value })} className="campo" /></div>
            <div><label className="etiqueta" htmlFor="cp-cargos">Cargos (separados por coma)</label><input id="cp-cargos" value={ed.cargos} onChange={(e) => setEd({ ...ed, cargos: e.target.value })} className="campo" placeholder="Operario, Motosierrista" /></div>
            <div><label className="etiqueta" htmlFor="cp-tc">Tipo de contrato</label>
              <select id="cp-tc" value={String(ed.tipoContrato)} disabled={esTipo(ed.codigo)} onChange={(e) => setEd({ ...ed, tipoContrato: e.target.value ? +e.target.value : '' })} className="campo">
                <option value="">Cualquiera</option>{TIPOS_CONTRATO.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
              </select></div>
          </div>
          <textarea aria-label="Texto de la plantilla" rows={18} value={ed.texto} onChange={(e) => setEd({ ...ed, texto: e.target.value })} className="campo num w-full text-xs leading-relaxed" />
          <p className="text-[10px] leading-relaxed text-tenue">Marcadores: {MARCADORES_CONTRATO.map(([k, d]) => <code key={k} title={d} className="mr-1 cursor-pointer hover:text-acento" onClick={() => setEd({ ...ed, texto: ed.texto + `{{${k}}}` })}>{`{{${k}}}`}</code>)}</p>
          {v.errores.map((e, i) => <p key={i} className="text-xs text-peligro">⛔ {e}</p>)}
          {v.avisos.map((e, i) => <p key={i} className="text-xs text-amber-500">⚠️ {e}</p>)}
          {v.ok && !v.avisos.length && <p className="text-xs text-acento">✅ Marcadores correctos.</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="boton" disabled={pendiente || !v.ok} onClick={() => run(() => guardarPlantillaContrato(empresaId, ed))}>Guardar plantilla</button>
            <button type="button" className="boton-sec" disabled={pendiente} onClick={() => bajarWord(ed.nombre || 'plantilla', ed.texto)}>⬇️ Word</button>
            <button type="button" className="boton-sec" onClick={() => setEd(null)}>Cancelar</button>
          </div>
        </section>
      )}
    </div>
  );
}
