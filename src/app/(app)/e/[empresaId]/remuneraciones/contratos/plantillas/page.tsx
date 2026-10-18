import type { Metadata } from 'next';
import Link from 'next/link';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { plantillasContrato, type PlantillaContratoGuardada } from '@/remuneraciones/contrato-trabajo';
import { PlantillasContrato } from './plantillas';

export const metadata: Metadata = { title: 'Plantillas de contrato' };

export default async function PlantillasContratoPage({ params }: PageProps<'/e/[empresaId]/remuneraciones/contratos/plantillas'>) {
  const { empresaId } = await params;
  const empresa = await requerirEmpresa(empresaId);
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from('contrato_plantillas').select('id,codigo,nombre,cargos,tipo_contrato,texto').eq('empresa_id', empresaId).order('nombre');
  const lista = plantillasContrato((data ?? []) as PlantillaContratoGuardada[]);
  return (
    <div className="space-y-4">
      <Link href={`/e/${empresaId}/remuneraciones/contratos`} className="text-sm text-tenue hover:text-texto">← Contratos</Link>
      <div>
        <h1 className="text-xl font-semibold">Plantillas de contrato</h1>
        <p className="text-sm text-tenue">Cada plantilla se puede asociar a uno o varios cargos: al abrir el contrato de un trabajador se sugiere la de su cargo. Descárgala en Word, edítala sin tocar los textos entre {'{{ }}'} (en amarillo) y vuelve a subirla: se revisa que los marcadores sigan intactos.</p>
      </div>
      <PlantillasContrato empresaId={empresaId} lista={lista} escribe={puedeEscribir(empresa.rol)} />
    </div>
  );
}
