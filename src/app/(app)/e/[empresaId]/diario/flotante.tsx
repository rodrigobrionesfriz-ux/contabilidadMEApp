'use client';

import { useState } from 'react';

/** Abre el libro diario en una ventana aparte, que se puede mover (incluso a otra pantalla) y redimensionar. */
export function BotonFlotante({ url }: { url: string }) {
  return (
    <button type="button" className="boton-sec" title="Abrir el libro diario en una ventana flotante"
      onClick={() => { const w = window.open(url, 'diario-flotante', 'popup=yes,width=980,height=720,left=80,top=60'); w?.focus(); }}>
      🗗 Ventana flotante
    </button>
  );
}

/** En la ventana flotante, los enlaces se abren en la ventana principal (si sigue abierta). */
export function LinkPrincipal({ href, className, title, children }: { href: string; className?: string; title?: string; children: React.ReactNode }) {
  return (
    <a href={href} className={className} title={title} target="_blank" rel="opener"
      onClick={(e) => {
        const o = window.opener as Window | null;
        if (o && !o.closed) { e.preventDefault(); o.location.href = href; o.focus(); }
      }}>{children}</a>
  );
}

/** Salta al asiento N° (ancla #nNUMERO). */
export function IrANumero() {
  const [n, setN] = useState('');
  return (
    <form className="flex items-center gap-1" onSubmit={(e) => {
      e.preventDefault();
      const el = document.getElementById(`n${n.trim()}`);
      if (el) { el.scrollIntoView({ block: 'start' }); const f = el.firstElementChild as HTMLElement | null; f?.classList.add('bg-acento/20'); setTimeout(() => f?.classList.remove('bg-acento/20'), 1500); }
    }}>
      <input value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="Ir a N°" aria-label="Ir al asiento número" className="campo num w-24 py-1 text-xs" />
    </form>
  );
}
