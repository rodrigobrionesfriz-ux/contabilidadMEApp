'use client';

import { useEffect } from 'react';

/**
 * Ventana sobre la página. Se cierra con Escape o con el botón ×.
 * `encima`: ventana flotante sobre otra ventana; Escape cierra sólo ésta.
 */
export function Modal({ titulo, sub, onCerrar, children, ancho = 'max-w-3xl', encima = false }: { titulo: string; sub?: string; onCerrar: () => void; children: React.ReactNode; ancho?: string; encima?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (encima) e.stopPropagation();
      onCerrar();
    };
    // La flotante escucha en document (antes que window) y corta el evento
    // para que la ventana de abajo no se cierre también.
    const blanco: Window | Document = encima ? document : window;
    blanco.addEventListener('keydown', k as EventListener);
    return () => blanco.removeEventListener('keydown', k as EventListener);
  }, [onCerrar, encima]);
  return (
    <div className={`fixed inset-0 ${encima ? 'z-[60]' : 'z-50'} flex items-start justify-center overflow-y-auto bg-velo p-4`} role="dialog" aria-modal="true" aria-label={titulo}>
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
