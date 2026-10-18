import type { Metadata } from 'next';
import { requerirEmpresa } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { FormEmpresa } from './form';

export const metadata: Metadata = { title: 'Empresa' };

export default async function EmpresaPage({ params }: PageProps<'/e/[empresaId]/empresa'>) {
  const { empresaId } = await params;
  const empresa = await requerirEmpresa(empresaId);
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from('empresas')
    .select('rut,razon_social,giro,domicilio,comuna,ciudad,representante,rut_representante,tasa_ppm,regimen,tasa_renta').eq('id', empresaId).single();
  if (error) throw new Error(error.message);
  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">Datos de la empresa</h1>
      <FormEmpresa empresaId={empresaId} datos={{ ...data, tasa_ppm: String(data.tasa_ppm ?? 0), tasa_renta: data.tasa_renta == null ? '' : String(data.tasa_renta) }} editable={empresa.rol === 'admin'} />
    </div>
  );
}
