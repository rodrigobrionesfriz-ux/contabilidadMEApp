'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { crearClienteNavegador } from '@/lib/supabase/client';

export interface ImportacionFila {
  id: string; anio: number; archivo: string | null; estado: string;
  resumen: { asientos?: number; documentos?: number } | null; creado: string; terminado: string | null;
}

export function Importaciones({ empresaId, filas }: { empresaId: string; filas: ImportacionFila[] }) {
  const router = useRouter();
  const [borrando, setBorrando] = useState<number | null>(null);
  const [confirma, setConfirma] = useState('');
  const [error, setError] = useState('');
  const [pendiente, iniciar] = useTransition();
  if (!filas.length) return null;

  const eliminar = (anio: number) => iniciar(async () => {
    const { error } = await crearClienteNavegador().rpc('eliminar_importacion', { p_empresa: empresaId, p_anio: anio });
    if (error) return setError(error.message);
    setBorrando(null); setConfirma(''); setError('');
    router.refresh();
  });

  return (
    <section className="space-y-2">
      <h2 className="font-semibold">Años importados</h2>
      <div className="tarjeta divide-y divide-borde">
        {filas.map((f) => (
          <div key={f.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <span className="num font-semibold">{f.anio}</span>
            <span className="min-w-0 flex-1 truncate text-tenue">
              {f.archivo} · {f.estado === 'completa' ? `${f.resumen?.asientos ?? 0} asientos, ${f.resumen?.documentos ?? 0} documentos` : '⚠️ incompleta'}
              {' · '}{new Date(f.terminado ?? f.creado).toLocaleString('es-CL')}
            </span>
            {borrando === f.anio ? (
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-peligro">Borra los asientos y documentos importados de {f.anio} y los asientos propios anulados de ese año. Escribe el año:</span>
                <input value={confirma} onChange={(e) => setConfirma(e.target.value)} className="campo w-20 py-1" aria-label="Confirmar año" />
                <button type="button" disabled={confirma !== String(f.anio) || pendiente} onClick={() => eliminar(f.anio)}
                  className="rounded-md bg-peligro px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">Eliminar</button>
                <button type="button" className="text-xs text-tenue" onClick={() => { setBorrando(null); setConfirma(''); }}>Cancelar</button>
              </span>
            ) : (
              <button type="button" className="text-xs text-tenue hover:text-peligro" onClick={() => setBorrando(f.anio)}>Eliminar importación</button>
            )}
          </div>
        ))}
      </div>
      {error && <p className="text-sm text-peligro">{error}</p>}
    </section>
  );
}
