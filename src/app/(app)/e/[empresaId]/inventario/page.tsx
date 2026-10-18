import type { Metadata } from 'next';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { datosInventario, apoyoInventario } from '@/lib/datos/inventario';
import { param, hoyISO } from '@/lib/formato';
import { Inventario } from './inventario';

export const metadata: Metadata = { title: 'Inventario' };

export default async function InventarioPage({ params, searchParams }: PageProps<'/e/[empresaId]/inventario'>) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const tab = param(sp.tab) || 'stock';
  const empresa = await requerirEmpresa(empresaId);
  const [datos, apoyo] = await Promise.all([datosInventario(empresaId), apoyoInventario(empresaId)]);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Inventario</h1>
        <p className="text-sm text-tenue">Auxiliar permanente por empresa · multibodega · lotes y vencimientos · costo promedio ponderado. El stock se reconstruye siempre desde los movimientos vigentes.</p>
      </div>
      <Inventario empresaId={empresaId} datos={datos} apoyo={apoyo} escribe={puedeEscribir(empresa.rol)} tab={tab} hoy={hoyISO()} />
    </div>
  );
}
