'use client';

import { useState, useTransition } from 'react';
import { anularAsiento } from '../asientos/acciones';

export function BotonAnular({ empresaId, id, numero }: { empresaId: string; id: string; numero: number }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [pendiente, iniciar] = useTransition();

  if (!abierto) {
    return <button type="button" onClick={() => setAbierto(true)} className="text-xs text-tenue hover:text-peligro">🚫 Anular</button>;
  }
  return (
    <form
      className="flex w-full flex-wrap items-center gap-2 sm:w-auto"
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          const r = await anularAsiento(empresaId, id, motivo);
          if (r.error) setError(r.error);
        });
      }}
    >
      <span className="text-xs text-tenue">N° {numero} se conserva, pero deja de afectar saldos.</span>
      <input autoFocus required value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo" className="campo w-48 py-1" />
      <button type="submit" disabled={pendiente} className="rounded-md bg-peligro px-3 py-1 text-xs font-semibold text-white">{pendiente ? '…' : 'Anular'}</button>
      <button type="button" onClick={() => setAbierto(false)} className="text-xs text-tenue">Cancelar</button>
      {error && <span className="w-full text-xs text-peligro">{error}</span>}
    </form>
  );
}
