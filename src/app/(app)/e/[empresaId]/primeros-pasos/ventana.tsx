'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Paso } from '@/empresa/primeros-pasos';
import { ListaPasos } from './lista';

/** Ventana de bienvenida al crear una empresa (se abre con ?bienvenida=1). */
export function VentanaPrimerosPasos({ empresaId, razonSocial, pasos, hechos, total, escribe }: {
  empresaId: string; razonSocial: string; pasos: Paso[]; hechos: number; total: number; escribe: boolean;
}) {
  const router = useRouter();
  const [abierta, setAbierta] = useState(true);
  const cerrar = () => { setAbierta(false); router.replace(`/e/${empresaId}`, { scroll: false }); };
  if (!abierta) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-velo p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="pp-titulo" onClick={(e) => e.target === e.currentTarget && cerrar()}>
      <div className="tarjeta w-full max-w-2xl space-y-4 p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="pp-titulo" className="text-lg font-semibold">🎉 {razonSocial} quedó creada</h2>
            <p className="text-sm text-tenue">Antes de empezar a registrar, deja lista la empresa con estos pasos. Puedes volver a esta lista cuando quieras desde Inicio o Configuración → Primeros pasos.</p>
          </div>
          <button type="button" aria-label="Cerrar" className="text-tenue hover:text-texto" onClick={cerrar}>✕</button>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-panel-2"><div className="h-full bg-acento" style={{ width: `${(hechos / total) * 100}%` }} /></div>
        <div className="max-h-[60vh] overflow-y-auto pr-1"><ListaPasos empresaId={empresaId} pasos={pasos} escribe={escribe} /></div>
        <div className="flex justify-end"><button type="button" className="boton" onClick={cerrar}>Entendido, lo hago después</button></div>
      </div>
    </div>
  );
}
