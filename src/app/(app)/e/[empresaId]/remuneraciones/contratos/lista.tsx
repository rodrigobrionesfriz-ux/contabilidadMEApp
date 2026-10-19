'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fechaCL } from '@/lib/formato';
import { Mensaje } from '@/components/form-estado';
import { archivosContratosDT, marcarInformados } from './acciones';
import { descargarAnsi } from './descargas';

export interface FilaContrato {
  id: string; nombre: string; rut: string; cargo: string; ok: boolean; faltan: string[]; avisos: string[];
  suscripcion: string; vence: string; informado: string; plantilla: string;
}

export function ListaContratos({ empresaId, filas, total, todos, escribe, hoy }: { empresaId: string; filas: FilaContrato[]; total: number; todos: boolean; escribe: boolean; hoy: string }) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(() => new Set(filas.filter((f) => f.ok && !f.informado).map((f) => f.id)));
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [faltan, setFaltan] = useState<{ trabajador: string; faltan: string[] }[]>([]);
  const [pendiente, iniciar] = useTransition();
  const toggle = (id: string, on: boolean) => setSel((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const descargar = (ids: string[]) => iniciar(async () => {
    const r = await archivosContratosDT(empresaId, ids);
    setFaltan(r.faltan);
    if (!r.ok) { setMsg({ error: r.error }); return; }
    r.archivos.forEach((a) => descargarAnsi(a.texto, a.nombre));
    const texto = `${r.archivos.length > 1 ? `Se generaron ${r.archivos.length} archivos (uno por cargo: ${r.archivos.map((a) => a.cargo).join(', ')}).\n\n` : ''}${r.avisos.length ? 'Revisa antes de subir:\n• ' + r.avisos.join('\n• ') + '\n\n' : ''}Sube el archivo en Mi DT → Registro de contratos → Carga masiva.\n\n¿Marcar ${ids.length === 1 ? 'el contrato' : `los ${ids.length} contratos`} como informado${ids.length === 1 ? '' : 's'} a la DT?`;
    if (window.confirm(texto)) { const m = await marcarInformados(empresaId, ids, true); setMsg(m.ok ? { ok: m.mensaje } : { error: m.error }); setSel(new Set()); router.refresh(); }
    else setMsg({ ok: `${r.archivos.length} archivo(s) descargado(s).` });
  });
  const marcar = (id: string, inf: boolean) => iniciar(async () => { const m = await marcarInformados(empresaId, [id], inf); setMsg(m.ok ? { ok: m.mensaje } : { error: m.error }); router.refresh(); });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {escribe && <button type="button" className="boton" disabled={pendiente || sel.size === 0} onClick={() => descargar([...sel])}>⬇️ CSV para la DT ({sel.size})</button>}
        <Link href={`?${todos ? '' : 'todos=1'}`} className="text-xs text-tenue hover:text-texto">{todos ? 'Ocultar los ya informados' : `Mostrar también los ya informados (${total - filas.length})`}</Link>
      </div>
      <Mensaje {...msg} />
      {faltan.length > 0 && (
        <div className="tarjeta p-3 text-xs">{faltan.map((f) => <p key={f.trabajador} className="text-peligro">⛔ {f.trabajador}: falta {f.faltan.join(', ')}</p>)}</div>
      )}
      <div className="tarjeta overflow-x-auto">
        <table className="w-full min-w-[900px] text-xs">
          <thead className="text-left text-tenue uppercase">
            <tr className="border-b border-borde"><th className="w-8 px-3 py-2" /><th className="px-2 py-2">Trabajador</th><th className="px-2 py-2">Datos DT</th><th className="px-2 py-2">Suscripción</th><th className="px-2 py-2">Registrar hasta</th><th className="px-2 py-2">Estado</th><th /></tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-tenue">{total ? 'Todos los contratos están informados.' : 'No hay trabajadores activos.'}</td></tr>}
            {filas.map((f) => {
              const atrasado = !f.informado && f.vence && f.vence < hoy;
              return (
                <tr key={f.id} className="border-b border-borde/40 align-top">
                  <td className="px-3 py-1.5"><input type="checkbox" aria-label={`Seleccionar ${f.nombre}`} disabled={!f.ok || !escribe} checked={sel.has(f.id)} onChange={(e) => toggle(f.id, e.target.checked)} /></td>
                  <td className="px-2 py-1.5"><div className="font-medium">{f.nombre}</div><div className="text-tenue">{f.rut} · {f.cargo || 'sin cargo'} · {f.plantilla}</div></td>
                  <td className="px-2 py-1.5">{f.ok ? <span className="text-acento">✅ Completo</span> : <span className="text-peligro" title={f.faltan.join(', ')}>⛔ Faltan {f.faltan.length}: {f.faltan.slice(0, 3).join(', ')}{f.faltan.length > 3 ? '…' : ''}</span>}
                    {f.avisos.map((a, i) => <div key={i} className="text-aviso">⚠️ {a}</div>)}</td>
                  <td className="num px-2 py-1.5">{f.suscripcion ? fechaCL(f.suscripcion) : '–'}</td>
                  <td className={`num px-2 py-1.5 ${atrasado ? 'text-peligro' : ''}`}>{f.vence ? fechaCL(f.vence) : '–'}{atrasado ? ' · vencido' : ''}</td>
                  <td className="px-2 py-1.5">{f.informado ? `✓ Informado ${fechaCL(f.informado)}` : 'Pendiente'}</td>
                  <td className="space-x-3 px-3 py-1.5 text-right whitespace-nowrap">
                    <Link className="text-acento hover:underline" href={`/e/${empresaId}/remuneraciones/contratos/${f.id}`}>Datos DT</Link>
                    <Link className="text-acento hover:underline" href={`/e/${empresaId}/remuneraciones/contratos/${f.id}/documento`}>📄 Contrato</Link>
                    {escribe && f.ok && <button type="button" className="text-tenue hover:text-texto" onClick={() => descargar([f.id])} title="CSV de este trabajador">⬇️</button>}
                    {escribe && (f.informado ? <button type="button" className="text-tenue hover:text-texto" title="Volver a pendiente" onClick={() => marcar(f.id, false)}>↺</button>
                      : <button type="button" className="text-tenue hover:text-texto" title="Marcar como informado a la DT" aria-label={`Marcar informado ${f.nombre}`} onClick={() => marcar(f.id, true)}>✓</button>)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
