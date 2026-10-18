import type { Metadata } from 'next';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { FormAsiento, type CuentaOpcion } from './form';
import { plantillasDeEmpresa } from '@/lib/datos/plantillas';

export const metadata: Metadata = { title: 'Nuevo asiento' };

export default async function NuevoAsientoPage({ params }: PageProps<'/e/[empresaId]/asientos/nuevo'>) {
  const { empresaId } = await params;
  const empresa = await requerirEmpresa(empresaId);
  if (!puedeEscribir(empresa.rol)) {
    return <p className="text-tenue">Tu rol ({empresa.rol}) no permite registrar asientos.</p>;
  }
  const supabase = await crearClienteServidor();
  const [cuentas, ccs, plantillas] = await Promise.all([
    supabase.from('cuentas').select('codigo,nombre,tipo_auxiliar,acepta_centro_costo,requiere_centro_costo')
      .eq('empresa_id', empresaId).eq('acepta_movimientos', true).eq('activa', true).order('codigo'),
    supabase.from('centros_costo').select('codigo,nombre').eq('empresa_id', empresaId).eq('activo', true).order('codigo'),
    plantillasDeEmpresa(empresaId),
  ]);
  if (cuentas.error) throw new Error(cuentas.error.message);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Nuevo asiento manual</h1>
      <FormAsiento empresaId={empresaId} cuentas={cuentas.data as CuentaOpcion[]} centros={ccs.data ?? []} plantillas={plantillas} />
    </div>
  );
}
