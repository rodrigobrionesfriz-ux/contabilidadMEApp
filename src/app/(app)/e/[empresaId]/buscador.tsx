'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { buscarGlobal, type ResultadoBusqueda } from './buscar-acciones';

const ICONO: Record<string, string> = { documento: '🧾', asiento: '✍️', trabajador: '👷', cuenta: '📒', activo: '🏗️', producto: '📦' };
const NOMBRE: Record<string, string> = { documento: 'Documento', asiento: 'Asiento', trabajador: 'Trabajador', cuenta: 'Cuenta', activo: 'Activo', producto: 'Producto' };

export function Buscador({ empresaId }: { empresaId: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState('');
  const [res, setRes] = useState<ResultadoBusqueda[]>([]);
  const [sel, setSel] = useState(0);
  const [buscando, iniciar] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const turno = useRef(0);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setAbierto(true); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  useEffect(() => { if (abierto) setTimeout(() => input.current?.focus(), 30); }, [abierto]);

  const cambiar = (v: string) => {
    setQ(v); setSel(0);
    const t = ++turno.current;
    if (v.trim().length < 2) { setRes([]); return; }
    setTimeout(() => {
      if (t !== turno.current) return;
      iniciar(async () => { const r = await buscarGlobal(empresaId, v); if (t === turno.current) setRes(r); });
    }, 250);
  };
  const ir = (r: ResultadoBusqueda | undefined) => { if (!r) return; setAbierto(false); setQ(''); setRes([]); router.push(r.href); };
  const cerrar = () => { setAbierto(false); };

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className="no-print flex w-full items-center gap-2 rounded-md border border-borde px-3 py-1.5 text-left text-sm text-tenue hover:text-texto" title="Búsqueda global (Ctrl+K)">
        🔍 <span className="flex-1">Buscar…</span><kbd className="hidden rounded border border-borde px-1 text-[10px] md:inline">Ctrl K</kbd>
      </button>
      {/* En portal: dentro de la barra lateral (que usa transform) un «fixed» quedaría encerrado en ella */}
      {abierto && createPortal(
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 p-4 pt-[10vh]" role="dialog" aria-modal="true" aria-label="Búsqueda global" onClick={cerrar}>
          <div className="tarjeta w-full max-w-2xl p-2" onClick={(e) => e.stopPropagation()}>
            <input ref={input} className="campo text-base" value={q} placeholder="Busca documentos, asientos, trabajadores, cuentas, activos o productos…" aria-label="Texto a buscar"
              onChange={(e) => cambiar(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') cerrar();
                else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, res.length - 1)); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
                else if (e.key === 'Enter') { e.preventDefault(); ir(res[sel]); }
              }} />
            <div className="mt-2 max-h-[60vh] overflow-y-auto">
              {q.trim().length < 2 ? <p className="p-4 text-center text-sm text-tenue">Escribe al menos 2 letras. Se buscan todas las palabras (por ejemplo «agro 455»).</p>
                : res.length ? res.map((r, i) => (
                  <button key={r.tipo + r.id} type="button" onMouseEnter={() => setSel(i)} onClick={() => ir(r)} className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left ${i === sel ? 'bg-panel-2' : ''}`}>
                    <span className="text-lg">{ICONO[r.tipo] || '•'}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm">{r.titulo}</span><span className="block truncate text-xs text-tenue">{r.sub}</span></span>
                    <span className="rounded border border-borde px-1.5 text-[9px] text-tenue uppercase">{NOMBRE[r.tipo] || r.tipo}</span>
                  </button>
                )) : <p className="p-4 text-center text-sm text-tenue">{buscando ? 'Buscando…' : `Sin resultados para «${q}».`}</p>}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
