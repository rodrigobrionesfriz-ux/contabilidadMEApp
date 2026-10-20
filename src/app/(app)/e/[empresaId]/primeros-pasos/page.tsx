import type { Metadata } from 'next';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { estadoPrimerosPasos } from '@/lib/datos/primeros-pasos';
import { ListaPasos } from './lista';

export const metadata: Metadata = { title: 'Primeros pasos' };

export default async function PrimerosPasosPage({ params }: PageProps<'/e/[empresaId]/primeros-pasos'>) {
  const { empresaId } = await params;
  const empresa = await requerirEmpresa(empresaId);
  const { pasos, hechos, total, completo } = await estadoPrimerosPasos(empresaId);
  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Primeros pasos</h1>
        <p className="text-sm text-tenue">{completo ? '✅ La empresa está lista para trabajar.' : `Lo que hay que dejar listo antes de empezar a registrar: ${hechos} de ${total} pasos resueltos.`} Los pasos con datos se detectan solos; el resto se marca a mano.</p>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-panel-2"><div className="h-full bg-acento" style={{ width: `${(hechos / total) * 100}%` }} /></div>
      <ListaPasos empresaId={empresaId} pasos={pasos} escribe={puedeEscribir(empresa.rol)} />
    </div>
  );
}
