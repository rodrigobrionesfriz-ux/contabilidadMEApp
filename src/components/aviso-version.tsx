'use client';

import { useEffect, useState } from 'react';
import { BUILD_ID } from '@/lib/version';

interface Info { version: string; build: string; novedades: string[] }
const CADA = 5 * 60 * 1000;

/** Consulta cada 5 minutos (y al volver a la pestaña) si hay un despliegue nuevo; si lo hay, ofrece recargar. */
export function AvisoVersion() {
  const [nueva, setNueva] = useState<Info | null>(null);
  const [cerrado, setCerrado] = useState('');
  useEffect(() => {
    if (BUILD_ID === 'dev') return;
    let vivo = true;
    const revisar = async () => {
      try {
        const r = await fetch('/api/version', { cache: 'no-store' });
        if (!r.ok) return;
        const info = (await r.json()) as Info;
        if (vivo && info.build && info.build !== BUILD_ID) setNueva(info);
      } catch { /* sin conexión: se reintenta en la próxima vuelta */ }
    };
    const alVolver = () => { if (document.visibilityState === 'visible') revisar(); };
    revisar();
    const t = setInterval(revisar, CADA);
    document.addEventListener('visibilitychange', alVolver);
    return () => { vivo = false; clearInterval(t); document.removeEventListener('visibilitychange', alVolver); };
  }, []);
  if (!nueva || cerrado === nueva.build) return null;
  return (
    <div role="status" className="no-print fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-xl border border-acento/50 bg-panel p-4 text-sm shadow-lg">
      <div className="font-semibold">🔄 Hay una nueva versión ({nueva.version})</div>
      {nueva.novedades.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-tenue">{nueva.novedades.map((n) => <li key={n}>{n}</li>)}</ul>}
      <p className="mt-1 text-xs text-tenue">Guarda lo que estés haciendo y actualiza.</p>
      <div className="mt-3 flex gap-2">
        <button type="button" className="boton" onClick={() => window.location.reload()}>Actualizar ahora</button>
        <button type="button" className="boton-sec" onClick={() => setCerrado(nueva.build)}>Más tarde</button>
      </div>
    </div>
  );
}
