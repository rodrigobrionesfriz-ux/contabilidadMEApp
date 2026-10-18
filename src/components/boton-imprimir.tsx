'use client';
export function BotonImprimir({ texto = '🖨️ Imprimir / PDF' }: { texto?: string }) {
  return <button type="button" className="boton-sec no-print" onClick={() => window.print()}>{texto}</button>;
}
