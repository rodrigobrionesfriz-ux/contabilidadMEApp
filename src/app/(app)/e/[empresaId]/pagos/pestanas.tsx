import Link from 'next/link';

export type VistaPagos = 'proveedor' | 'honorario' | 'cliente' | 'historial';
const NOMBRE: Record<VistaPagos, string> = { proveedor: 'Proveedores', honorario: 'Honorarios', cliente: 'Clientes', historial: '📜 Historial' };

/** Pestañas de Pagos y cobros: pendientes por tipo y el historial de comprobantes. */
export function PestanasPagos({ actual }: { actual: VistaPagos }) {
  return (
    <div className="flex gap-1 rounded-md border border-borde p-1 text-sm">
      {(['proveedor', 'honorario', 'cliente', 'historial'] as const).map((t) => (
        <Link key={t} href={`?tipo=${t}`} className={`rounded px-3 py-1 ${actual === t ? 'bg-panel-2 text-acento' : 'text-tenue'}`}>{NOMBRE[t]}</Link>
      ))}
    </div>
  );
}
