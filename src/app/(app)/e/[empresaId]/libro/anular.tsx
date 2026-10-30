'use client';

import { useState, useTransition } from 'react';
import { anularDocumento } from '../rcv/acciones';

/** Anula el documento y su asiento (queda la traza). Con `eliminar` (resúmenes de boletas o vouchers) se muestra como Eliminar y el motivo es opcional. */
export function AnularDocumento({ empresaId, id, etiqueta, eliminar }: { empresaId: string; id: string; etiqueta: string; eliminar?: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [pendiente, iniciar] = useTransition();
  const accion = eliminar ? 'Eliminar' : 'Anular';
  if (!abierto) return <button type="button" className="text-tenue hover:text-peligro" onClick={() => setAbierto(true)}>{eliminar ? '🗑 Eliminar' : 'Anular'}</button>;
  return (
    <form className="flex flex-wrap items-center justify-end gap-1" onSubmit={(e) => {
      e.preventDefault();
      iniciar(async () => { const r = await anularDocumento(empresaId, id, motivo.trim() || 'Eliminado desde el libro de ventas'); if (r.error) setError(r.error); });
    }}>
      <input autoFocus required={!eliminar} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={eliminar ? `Motivo opcional (${etiqueta})` : `Motivo (${etiqueta})`} className="campo w-40 py-0.5 text-xs" />
      <button type="submit" disabled={pendiente} className="rounded bg-peligro px-2 py-0.5 text-[11px] font-semibold text-white">{pendiente ? '…' : accion}</button>
      <button type="button" className="text-tenue" onClick={() => setAbierto(false)}>✕</button>
      {error && <div className="w-full text-right text-peligro">{error}</div>}
    </form>
  );
}
