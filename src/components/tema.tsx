'use client';

import { useSyncExternalStore } from 'react';

export type Tema = 'oscuro' | 'claro';

function aplicar(t: Tema) {
  if (t === 'claro') document.documentElement.dataset.theme = 'claro';
  else delete document.documentElement.dataset.theme;
  document.cookie = `tema=${t}; path=/; max-age=31536000; samesite=lax`;
}

// El tema vive en <html data-theme>: se lee de ahí y se observa por si cambia.
function suscribir(aviso: () => void) {
  const obs = new MutationObserver(aviso);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => obs.disconnect();
}
const leer = (): Tema => (document.documentElement.dataset.theme === 'claro' ? 'claro' : 'oscuro');
const enServidor = (): Tema | null => null;

/** Botón para alternar entre el tema oscuro y el claro azul grisáceo. */
export function BotonTema({ className = '' }: { className?: string }) {
  const tema = useSyncExternalStore<Tema | null>(suscribir, leer, enServidor);
  const siguiente: Tema = tema === 'claro' ? 'oscuro' : 'claro';
  const texto = tema === 'claro' ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro';
  return (
    <button type="button" className={`boton-sec px-2.5 ${className}`} onClick={() => aplicar(siguiente)} title={texto} aria-label={texto}>
      {/* En el servidor no se conoce el tema: ícono neutro hasta hidratar */}
      <span aria-hidden>{tema === null ? '◐' : tema === 'claro' ? '🌙' : '☀️'}</span>
    </button>
  );
}
