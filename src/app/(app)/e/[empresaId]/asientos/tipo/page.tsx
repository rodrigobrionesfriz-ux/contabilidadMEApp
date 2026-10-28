import type { Metadata } from 'next';
import Link from 'next/link';
import { requerirEmpresa, empresasDelUsuario, puedeEscribir } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { plantillasDeEmpresa } from '@/lib/datos/plantillas';
import { Plantillas } from './plantillas';

export const metadata: Metadata = { title: 'Asientos tipo' };

export default async function AsientosTipoPage({ params }: PageProps<'/e/[empresaId]/asientos/tipo'>) {
  const { empresaId } = await params;
  const empresa = await requerirEmpresa(empresaId);
  const supabase = await crearClienteServidor();
  const [lista, cuentas, centros, empresas] = await Promise.all([
    plantillasDeEmpresa(empresaId),
    supabase.from('cuentas').select('codigo,nombre').eq('empresa_id', empresaId).eq('acepta_movimientos', true).eq('activa', true).order('codigo'),
    supabase.from('centros_costo').select('codigo,nombre').eq('empresa_id', empresaId).eq('activo', true).order('codigo'),
    empresasDelUsuario(),
  ]);
  return (
    <div className="space-y-4">
      <div>
        <Link href={`/e/${empresaId}/asientos/nuevo`} className="text-sm text-acento hover:underline">← Comprobantes</Link>
        <h1 className="text-xl font-semibold">Asientos tipo</h1>
        <p className="text-sm text-tenue">Plantillas con la estructura de asientos recurrentes (cuentas, glosa, centros y, si quieres, montos), incluida la distribución de un gasto por porcentaje. Se aplican en <Link className="text-acento hover:underline" href={`/e/${empresaId}/asientos/nuevo`}>Nuevo asiento</Link>.</p>
      </div>
      <Plantillas empresaId={empresaId} lista={lista} cuentas={cuentas.data ?? []} centros={centros.data ?? []} escribe={puedeEscribir(empresa.rol)}
        otras={empresas.filter((e) => e.id !== empresaId && puedeEscribir(e.rol)).map((e) => ({ id: e.id, razon_social: e.razon_social }))} />
    </div>
  );
}
