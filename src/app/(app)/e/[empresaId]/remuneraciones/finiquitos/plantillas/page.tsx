import type { Metadata } from 'next';
import Link from 'next/link';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { plantillasFiniquito } from '@/lib/datos/remuneraciones';
import { plantillasDisponibles, CAUSALES, MARCADORES } from '@/remuneraciones/finiquito';
import { Plantillas } from './plantillas';

export const metadata: Metadata = { title: 'Plantillas de finiquito' };

export default async function PlantillasPage({ params }: PageProps<'/e/[empresaId]/remuneraciones/finiquitos/plantillas'>) {
  const { empresaId } = await params;
  const empresa = await requerirEmpresa(empresaId);
  const lista = plantillasDisponibles(await plantillasFiniquito(empresaId));
  return (
    <div className="space-y-4">
      <Link href={`/e/${empresaId}/remuneraciones/finiquitos`} className="text-sm text-tenue hover:text-texto">← Finiquitos</Link>
      <div>
        <h1 className="text-xl font-semibold">Plantillas de finiquito</h1>
        <p className="text-sm text-tenue">Las plantillas tipo se pueden editar y restaurar. Puedes crear las tuyas escribiéndolas o subiendo un archivo (.docx, .txt, .md, .html) con marcadores como {'{{trabajador}}'} o {'{{total}}'}.</p>
      </div>
      <Plantillas empresaId={empresaId} lista={lista} escribe={puedeEscribir(empresa.rol)} causales={CAUSALES.map((c) => ({ k: c.k, nm: c.nm }))} marcadores={MARCADORES} />
    </div>
  );
}
