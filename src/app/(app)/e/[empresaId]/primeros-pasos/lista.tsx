'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Paso } from '@/empresa/primeros-pasos';
import { marcarPaso } from './acciones';

const ICONO = { listo: '✓', omitido: '–', pendiente: '' } as const;

/** Lista de pasos con su estado, enlace y botones para marcar listo u omitir. */
export function ListaPasos({ empresaId, pasos, escribe, alIr }: { empresaId: string; pasos: Paso[]; escribe: boolean; alIr?: () => void }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [pendiente, iniciar] = useTransition();
  const marcar = (id: string, estado: 'listo' | 'omitido' | null) => iniciar(async () => {
    const r = await marcarPaso(empresaId, id, estado); setError(r.ok ? '' : r.error ?? ''); if (r.ok) router.refresh();
  });
  const primeroPendiente = pasos.find((p) => p.estado === 'pendiente')?.id;
  return (
    <ol className="space-y-2">
      {pasos.map((p) => {
        const actual = p.id === primeroPendiente;
        return (
          <li key={p.id} className={`flex gap-3 rounded-lg border p-3 ${actual ? 'border-acento bg-acento/5' : 'border-borde'} ${p.estado !== 'pendiente' ? 'opacity-70' : ''}`}>
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${p.estado === 'listo' ? 'bg-acento text-sobre-acento' : p.estado === 'omitido' ? 'bg-panel-2 text-tenue' : actual ? 'border-2 border-acento text-acento' : 'border border-borde text-tenue'}`}>
              {ICONO[p.estado] || p.n}
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className={`font-semibold ${p.estado === 'omitido' ? 'line-through' : ''}`}>Paso {p.n} · {p.titulo}</span>
                {p.opcional && <span className="text-[10px] text-tenue uppercase">opcional</span>}
                {p.estado === 'listo' && <span className="text-xs text-acento">{p.auto ? 'detectado' : 'listo'}</span>}
                {p.estado === 'omitido' && <span className="text-xs text-tenue">omitido</span>}
              </div>
              <p className="text-xs leading-relaxed text-tenue">{p.detalle}</p>
              {p.nota && <p className="text-xs text-info">{p.nota}</p>}
              <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                <Link href={`/e/${empresaId}${p.ruta}`} onClick={alIr} className={actual ? 'boton py-1 text-xs' : 'boton-sec py-1 text-xs'}>Ir →</Link>
                {escribe && !p.auto && p.estado === 'pendiente' && <button type="button" disabled={pendiente} className="text-acento hover:underline" onClick={() => marcar(p.id, 'listo')}>Marcar como listo</button>}
                {escribe && p.estado === 'pendiente' && <button type="button" disabled={pendiente} className="text-tenue hover:underline" onClick={() => marcar(p.id, 'omitido')}>{p.opcional ? 'No aplica' : 'Omitir'}</button>}
                {escribe && !p.auto && p.estado !== 'pendiente' && <button type="button" disabled={pendiente} className="text-tenue hover:underline" onClick={() => marcar(p.id, null)}>Deshacer</button>}
              </div>
            </div>
          </li>
        );
      })}
      {error && <li className="text-xs text-peligro">{error}</li>}
    </ol>
  );
}
