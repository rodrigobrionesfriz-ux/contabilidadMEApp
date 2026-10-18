'use client';
export function Imprimir() {
  return <button type="button" className="boton-sec" onClick={() => window.print()}>🖨️ Imprimir / PDF</button>;
}
