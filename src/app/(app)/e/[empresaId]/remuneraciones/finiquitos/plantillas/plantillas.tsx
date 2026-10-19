'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { PLANTILLAS_TIPO, type Plantilla } from '@/remuneraciones/finiquito';
import { leerArchivoTexto } from '@/lib/leer-texto';
import { Mensaje } from '@/components/form-estado';
import { guardarPlantilla, eliminarPlantilla } from '../acciones';

type P = Plantilla & { uuid?: string };
interface Edicion { uuid?: string; codigo?: string; nombre: string; causal: string; texto: string }

export function Plantillas({ empresaId, lista, escribe, causales, marcadores }: {
  empresaId: string; lista: P[]; escribe: boolean; causales: { k: string; nm: string }[]; marcadores: [string, string][];
}) {
  const router = useRouter();
  const [ed, setEd] = useState<Edicion | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pendiente, iniciar] = useTransition();
  const run = (f: () => Promise<{ ok: boolean; mensaje?: string; error?: string }>) => iniciar(async () => {
    const r = await f(); setMsg(r.ok ? { ok: r.mensaje } : { error: r.error }); if (r.ok) { setEd(null); router.refresh(); }
  });
  const generica = PLANTILLAS_TIPO.find((x) => x.id === 'generica')!.texto;
  const subir = async (file: File | undefined) => {
    if (!file) return;
    try { const texto = await leerArchivoTexto(file); setEd({ nombre: file.name.replace(/\.[^.]+$/, ''), causal: '', texto }); setMsg({}); }
    catch (e) { setMsg({ error: e instanceof Error ? e.message : String(e) }); }
  };
  const faltantes = ed ? ['trabajador', 'total', 'detalle'].filter((k) => !new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`).test(ed.texto)) : [];
  const desconocidos = ed ? [...new Set((ed.texto.match(/\{\{\s*([a-z_]+)\s*\}\}/gi) || []).map((m) => m.replace(/[{}\s]/g, '').toLowerCase()).filter((k) => !marcadores.some(([x]) => x === k)))] : [];
  return (
    <div className="space-y-4">
      <Mensaje {...msg} />
      <div className="tarjeta overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-tenue uppercase"><tr className="border-b border-borde"><th className="px-3 py-2">Plantilla</th><th className="px-2 py-2">Causal</th><th className="px-2 py-2">Tipo</th><th /></tr></thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.id} className="border-b border-borde/40">
                <td className="px-3 py-1.5 font-medium">{p.nombre}</td>
                <td className="px-2 py-1.5">{causales.find((c) => c.k === p.causal)?.nm || 'Cualquiera'}</td>
                <td className="px-2 py-1.5">{p.tipo ? (p.editada ? 'Tipo (editada)' : 'Tipo') : 'Propia'}</td>
                <td className="space-x-3 px-3 py-1.5 text-right whitespace-nowrap">
                  {escribe && <button type="button" className="text-acento hover:underline" onClick={() => setEd({ uuid: p.uuid, codigo: p.id, nombre: p.nombre, causal: p.causal, texto: p.texto })}>Editar</button>}
                  {escribe && <button type="button" className="text-tenue hover:text-texto" onClick={() => setEd({ nombre: `${p.nombre} (copia)`, causal: p.causal, texto: p.texto })}>Duplicar</button>}
                  {escribe && p.uuid && <button type="button" className="text-tenue hover:text-peligro" onClick={() => window.confirm(p.tipo ? '¿Restaurar el texto original de esta plantilla tipo?' : '¿Eliminar esta plantilla?') && run(() => eliminarPlantilla(empresaId, p.uuid!))}>{p.tipo ? 'Restaurar' : 'Eliminar'}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {escribe && !ed && (
        <div className="flex gap-2">
          <button type="button" className="boton-sec" onClick={() => setEd({ nombre: '', causal: '', texto: generica })}>+ Nueva plantilla</button>
          <label className="boton-sec cursor-pointer">📤 Subir archivo<input type="file" accept=".txt,.docx,.md,.html,.htm" className="sr-only" onChange={(e) => { subir(e.target.files?.[0]); e.target.value = ''; }} /></label>
        </div>
      )}
      {ed && (
        <section className="tarjeta space-y-3 p-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="etiqueta" htmlFor="pl-nombre">Nombre</label><input id="pl-nombre" value={ed.nombre} onChange={(e) => setEd({ ...ed, nombre: e.target.value })} className="campo" /></div>
            <div><label className="etiqueta" htmlFor="pl-causal">Causal</label>
              <select id="pl-causal" value={ed.causal} disabled={!!ed.codigo && PLANTILLAS_TIPO.some((x) => x.id === ed.codigo)} onChange={(e) => setEd({ ...ed, causal: e.target.value })} className="campo">
                <option value="">Cualquiera</option>{causales.map((c) => <option key={c.k} value={c.k}>{c.nm}</option>)}
              </select></div>
          </div>
          <textarea aria-label="Texto de la plantilla" rows={18} value={ed.texto} onChange={(e) => setEd({ ...ed, texto: e.target.value })} className="campo num w-full text-xs leading-relaxed" />
          <p className="text-[10px] leading-relaxed text-tenue">Marcadores: {marcadores.map(([k, d]) => <code key={k} title={d} className="mr-1 cursor-pointer hover:text-acento" onClick={() => setEd({ ...ed, texto: ed.texto + `{{${k}}}` })}>{`{{${k}}}`}</code>)}</p>
          {faltantes.length > 0 && <p className="text-xs text-aviso">⚠️ La plantilla no usa {faltantes.map((k) => `{{${k}}}`).join(', ')}.</p>}
          {desconocidos.length > 0 && <p className="text-xs text-peligro">❌ Marcadores desconocidos (quedarán a la vista en el documento): {desconocidos.map((k) => `{{${k}}}`).join(', ')}</p>}
          <div className="flex gap-2">
            <button type="button" className="boton" disabled={pendiente} onClick={() => run(() => guardarPlantilla(empresaId, ed))}>Guardar plantilla</button>
            <button type="button" className="boton-sec" onClick={() => setEd(null)}>Cancelar</button>
          </div>
        </section>
      )}
    </div>
  );
}
