'use client';

import { useState, useTransition } from 'react';
import { anularDocumento } from '../rcv/acciones';

export function AnularDocumento({ empresaId, id, etiqueta }: { empresaId: string; id: string; etiqueta: string }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [pendiente, iniciar] = useTransition();
  if (!abierto) return <button type="button" className="text-tenue hover:text-peligro" onClick={() => setAbierto(true)}>Anular</button>;
  return (
    <form className="flex flex-wrap items-center justify-end gap-1" onSubmit={(e) => {
      e.preventDefault();
      iniciar(async () => { const r = await anularDocumento(empresaId, id, motivo); if (r.error) setError(r.error); });
    }}>
      <input autoFocus required value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={`Motivo (${etiqueta})`} className="campo w-40 py-0.5 text-xs" />
      <button type="submit" disabled={pendiente} className="rounded bg-peligro px-2 py-0.5 text-[11px] font-semibold text-white">Anular</button>
      <button type="button" className="text-tenue" onClick={() => setAbierto(false)}>✕</button>
      {error && <div className="w-full text-right text-peligro">{error}</div>}
    </form>
  );
}
