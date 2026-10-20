'use client';

import { useState, useTransition } from 'react';
import { aWindows1252, type Observacion } from '@/remuneraciones/lre';
import type { CfgPrevired } from '@/remuneraciones/previred';
import { Mensaje } from '@/components/form-estado';
import { archivoLRE, archivoPrevired, guardarCfgPrevired, type ResArchivo } from './acciones-declarar';

function descargar(texto: string, nombre: string, tipo: string) {
  const blob = new Blob([aWindows1252(texto)], { type: `${tipo};charset=windows-1252` });
  const u = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = u; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}

/** Archivos para la Dirección del Trabajo (LRE) y Previred, con su validación. */
export function Declarar({ empresaId, anio, mes, cerrado, admin, previred }: {
  empresaId: string; anio: number; mes: number; cerrado: boolean; admin: boolean; previred: CfgPrevired;
}) {
  const [res, setRes] = useState<(ResArchivo & { tipo: 'LRE' | 'Previred' }) | null>(null);
  const [pendiente, iniciar] = useTransition();
  const [suc, setSuc] = useState(previred.sucursalMutual || '');
  const [cods, setCods] = useState(Object.entries(previred.codigos || {}).map(([k, v]) => `${k}=${v}`).join('\n'));
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const generar = (tipo: 'LRE' | 'Previred') => iniciar(async () => {
    const r = tipo === 'LRE' ? await archivoLRE(empresaId, anio, mes) : await archivoPrevired(empresaId, anio, mes);
    setRes({ ...r, tipo });
    if (r.ok && r.texto) descargar(r.texto, r.nombre, tipo === 'LRE' ? 'text/csv' : 'text/plain');
  });
  const guardarCfg = () => iniciar(async () => {
    const codigos: Record<string, string> = {};
    for (const l of cods.split(/\n/).map((x) => x.trim()).filter(Boolean)) {
      const m = l.match(/^([a-z]+:[a-z0-9_]+)\s*=\s*(\d+)$/i);
      if (!m) { setMsg({ error: `Línea no válida: "${l}". Usa tabla:clave=código, por ejemplo salud:esencial=99.` }); return; }
      codigos[m[1].toLowerCase()] = m[2];
    }
    const r = await guardarCfgPrevired(empresaId, { sucursalMutual: suc, codigos });
    setMsg(r.ok ? { ok: r.mensaje } : { error: r.error });
  });
  const filas: (Observacion & { tipo: string })[] = res ? [...res.errores.map((x) => ({ ...x, tipo: '❌' })), ...res.advertencias.map((x) => ({ ...x, tipo: '⚠️' }))] : [];
  return (
    <section className="tarjeta space-y-3 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Declarar el mes</h2>
          <p className="text-xs text-tenue">{cerrado ? 'Se generan desde la foto del libro cerrado.' : 'El libro está provisorio: ciérralo antes de declarar para que los archivos coincidan con lo pagado.'}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="boton-sec" disabled={pendiente} onClick={() => generar('LRE')}>📄 LRE Dirección del Trabajo</button>
          <button type="button" className="boton-sec" disabled={pendiente} onClick={() => generar('Previred')}>📤 Archivo Previred</button>
        </div>
      </div>
      {res && (
        <div className="space-y-2" role="status">
          <p className={res.ok ? 'text-acento' : 'text-peligro'}>
            {res.ok ? `✅ ${res.tipo}: archivo ${res.nombre} descargado (${res.lineas} línea(s)).` : `❌ ${res.tipo}: ${res.errores.length} error(es). El archivo no se genera hasta corregirlos.`}
          </p>
          {filas.length > 0 && (
            <table className="w-full text-xs">
              <thead className="text-left text-tenue"><tr className="border-b border-borde"><th className="py-1">Tipo</th><th>Trabajador</th><th>Campo</th><th>Detalle</th></tr></thead>
              <tbody>{filas.map((x, i) => <tr key={i} className="border-b border-borde/30"><td className="py-1">{x.tipo}</td><td>{x.trabajador}</td><td className="num">{x.campo}</td><td>{x.msg}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      )}
      <details className="text-xs">
        <summary className="cursor-pointer text-tenue">Configuración Previred {admin ? '' : '(sólo administrador)'}</summary>
        <div className="mt-2 grid gap-3 sm:grid-cols-[200px_1fr_auto] sm:items-end">
          <div><label className="etiqueta" htmlFor="pv-suc">Sucursal mutual (campo 99)</label><input id="pv-suc" disabled={!admin} value={suc} onChange={(e) => setSuc(e.target.value)} className="campo num" placeholder="0" /></div>
          <div><label className="etiqueta" htmlFor="pv-cod">Códigos manuales de institución</label>
            <textarea id="pv-cod" disabled={!admin} rows={2} value={cods} onChange={(e) => setCods(e.target.value)} className="campo num" placeholder="salud:esencial=99" />
            <p className="mt-1 text-tenue">Para instituciones fuera de la tabla Previred, una por línea: tabla:clave=código (tablas afp, salud, ccaf, mutual).</p></div>
          {admin && <button type="button" className="boton-sec" disabled={pendiente} onClick={guardarCfg}>Guardar</button>}
        </div>
        <Mensaje {...msg} />
      </details>
    </section>
  );
}
