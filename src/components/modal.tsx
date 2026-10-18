'use client';

import { useEffect } from 'react';

/** Ventana sobre la página. Se cierra con Escape o con el botón ×. */
export function Modal({ titulo, sub, onCerrar, children, ancho = 'max-w-3xl' }: { titulo: string; sub?: string; onCerrar: () => void; children: React.ReactNode; ancho?: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onCerrar]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className={`tarjeta my-8 w-full ${ancho} space-y-3 p-5 text-sm`}>
        <div className="flex items-start justify-between gap-3">
          <div><h2 className="text-base font-semibold">{titulo}</h2>{sub && <p className="text-xs text-tenue">{sub}</p>}</div>
          <button type="button" className="text-xl leading-none text-tenue hover:text-texto" onClick={onCerrar} aria-label="Cerrar">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
