'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { combinarContrato, faltantesContrato, MARCADORES_CONTRATO } from '@/remuneraciones/contrato-trabajo';
import { descargarDocx } from '@/lib/docx';
import { Mensaje } from '@/components/form-estado';
import { guardarContratoTrabajador, guardarPlantillaContrato } from '../../acciones';
import { slug } from '../../descargas';

interface Pl { id: string; nombre: string; texto: string; tipo: boolean }

/** Texto → bloques: 1ª línea en mayúsculas = título; "PRIMERO: TÍTULO." en negrita; [dato] faltante resaltado. */
function Bloques({ texto }: { texto: string }) {
  const partes = texto.replace(/\r/g, '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const marcar = (s: string) => s.split(/(\[[a-záéíóúñ ]+\])/g).map((x, i) => (/^\[[a-záéíóúñ ]+\]$/.test(x) ? <mark key={i} className="rounded bg-amber-200 px-0.5 text-black">{x}</mark> : x));
  return (<>{partes.map((b, i) => {
    if (i === 0 && b.length < 90 && b === b.toUpperCase()) return <h1 key={i} className="text-center text-base font-bold tracking-wide">{b}</h1>;
    const m = b.match(/^([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ]{2,40}:)/);
    return <p key={i} className="text-justify whitespace-pre-line">{m && <b>{m[1]}</b>}{marcar(m ? b.slice(m[1].length) : b)}</p>;
  })}</>);
}

export function DocumentoContrato({ empresaId, trabajador, vals, plantillas, plantillaId, textoPropio, empresa, escribe }: {
  empresaId: string; trabajador: { id: string; nombre: string; cargo: string }; vals: Record<string, string>; plantillas: Pl[];
  plantillaId: string; textoPropio: string; empresa: { nombre: string; rut: string; rep: string }; escribe: boolean;
}) {
  const router = useRouter();
  const [pid, setPid] = useState(plantillaId);
  const [texto, setTexto] = useState(textoPropio);
  const [editar, setEditar] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pendiente, iniciar] = useTransition();
  const base = plantillas.find((p) => p.id === pid)?.texto || plantillas[0]?.texto || '';
  const efectivo = texto.trim() ? texto : base;
  const combinado = combinarContrato(efectivo, vals);
  const faltan = faltantesContrato(efectivo, vals);
  const run = (f: () => Promise<{ ok: boolean; mensaje?: string; error?: string }>) => iniciar(async () => { const r = await f(); setMsg(r.ok ? { ok: r.mensaje } : { error: r.error }); if (r.ok) router.refresh(); });
  const word = () => iniciar(async () => {
    try {
      await descargarDocx(combinado, `contrato_${slug(trabajador.nombre)}.docx`, { titulo: `Contrato de trabajo · ${trabajador.nombre}`,
        firmas: [[empresa.nombre || 'EMPLEADOR', `RUT ${empresa.rut}`, ...(empresa.rep ? [`p.p. ${empresa.rep}`] : [])], [vals.trabajador, vals.rut_trabajador, 'TRABAJADOR']] });
    } catch (e) { setMsg({ error: e instanceof Error ? e.message : String(e) }); }
  });
  return (
    <div className="space-y-4">
      <div className="no-print tarjeta flex flex-wrap items-end gap-3 p-4 text-sm">
        <div className="min-w-64"><label className="etiqueta" htmlFor="ct-pl">Plantilla</label>
          <select id="ct-pl" value={pid} disabled={!escribe} onChange={(e) => setPid(e.target.value)} className="campo">
            {plantillas.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.tipo ? '' : ' · propia'}</option>)}
          </select></div>
        <button type="button" className="boton" onClick={() => window.print()}>🖨️ Imprimir / PDF</button>
        <button type="button" className="boton-sec" disabled={pendiente} onClick={word}>📝 Word</button>
        {escribe && <button type="button" className="boton-sec" onClick={() => { if (!texto) setTexto(base); setEditar(!editar); }}>{editar ? 'Cerrar editor' : '✏️ Editar texto'}</button>}
        {escribe && <button type="button" className="boton-sec" disabled={pendiente} onClick={() => run(() => guardarContratoTrabajador(empresaId, trabajador.id, pid, texto.trim() && texto !== base ? texto : null))}>💾 Guardar</button>}
      </div>
      {editar && (
        <div className="no-print tarjeta space-y-2 p-4">
          <textarea aria-label="Texto del contrato" rows={18} value={texto || base} onChange={(e) => setTexto(e.target.value)} className="campo num w-full text-xs leading-relaxed" />
          <p className="text-[10px] leading-relaxed text-tenue">Marcadores: {MARCADORES_CONTRATO.map(([k, d]) => <code key={k} title={d} className="mr-1 cursor-pointer hover:text-acento" onClick={() => setTexto((x) => (x || base) + `{{${k}}}`)}>{`{{${k}}}`}</code>)}</p>
          <div className="flex flex-wrap gap-3 text-xs">
            {texto && <button type="button" className="text-peligro hover:underline" onClick={() => setTexto('')}>Volver a la plantilla</button>}
            {trabajador.cargo && <button type="button" className="text-acento hover:underline" disabled={pendiente}
              onClick={() => run(() => guardarPlantillaContrato(empresaId, { nombre: `Contrato ${trabajador.cargo}`, cargos: trabajador.cargo, tipoContrato: '', texto: texto || base, original: base }))}>Guardar como plantilla del cargo «{trabajador.cargo}»</button>}
          </div>
        </div>
      )}
      {faltan.length > 0 && <p className="no-print text-xs text-amber-500">⚠️ Datos vacíos en el contrato: {faltan.join(', ')}.</p>}
      <Mensaje {...msg} />
      <article className="hoja tarjeta mx-auto max-w-3xl space-y-4 p-10 text-sm leading-relaxed">
        <Bloques texto={combinado} />
        <div className="grid grid-cols-2 gap-10 pt-16 text-center text-xs">
          <div><div className="mb-1 border-t border-current" /><b>{empresa.nombre || 'EMPLEADOR'}</b><div>RUT {empresa.rut}</div>{empresa.rep && <div>p.p. {empresa.rep}</div>}</div>
          <div><div className="mb-1 border-t border-current" /><b>{vals.trabajador}</b><div>{vals.rut_trabajador}</div><div>TRABAJADOR</div></div>
        </div>
      </article>
    </div>
  );
}
