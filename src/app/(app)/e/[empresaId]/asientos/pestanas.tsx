import Link from 'next/link';

/** Pestañas de Comprobantes: registrar un asiento nuevo o buscar los existentes. */
export function PestanasComprobantes({ empresaId, activa, escribe = true }: { empresaId: string; activa: 'nuevo' | 'buscar'; escribe?: boolean }) {
  const cls = (on: boolean) => `-mb-px border-b-2 px-3 py-2 text-sm font-medium ${on ? 'border-acento text-acento' : 'border-transparent text-tenue hover:text-texto'}`;
  return (
    <nav className="no-print flex gap-1 border-b border-borde" aria-label="Comprobantes">
      {escribe && <Link href={`/e/${empresaId}/asientos/nuevo`} className={cls(activa === 'nuevo')}>➕ Nuevo asiento</Link>}
      <Link href={`/e/${empresaId}/asientos`} className={cls(activa === 'buscar')}>🔎 Buscar comprobantes</Link>
    </nav>
  );
}
