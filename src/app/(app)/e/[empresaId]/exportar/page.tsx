import type { Metadata } from 'next';
import { requerirEmpresa } from '@/lib/auth';
import { Exportar } from './exportar';

export const metadata: Metadata = { title: 'Exportar a Excel' };

export default async function ExportarPage({ params }: PageProps<'/e/[empresaId]/exportar'>) {
  const { empresaId } = await params;
  await requerirEmpresa(empresaId);
  const y = new Date().getFullYear();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Exportar a Excel</h1>
        <p className="max-w-3xl text-sm text-tenue">Descarga toda la información del año en un libro Excel: plan de cuentas, libro diario línea por línea, documentos de compra, venta y honorarios, centros de costo, trabajadores, activo fijo y el inventario. Sirve para revisar, entregar al auditor o archivar. Los respaldos completos de la base los hace Supabase.</p>
      </div>
      <section className="tarjeta p-4"><Exportar empresaId={empresaId} anios={Array.from({ length: 8 }, (_, i) => y - i)} /></section>
    </div>
  );
}
