import type { Metadata } from 'next';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { planDeEmpresa, centrosDeEmpresa } from '@/lib/datos/maestros';
import { param } from '@/lib/formato';
import { FormDocumento } from './form';

export const metadata: Metadata = { title: 'Nuevo documento' };

export default async function NuevoDocumentoPage({ params, searchParams }: PageProps<'/e/[empresaId]/documentos/nuevo'>) {
  const { empresaId } = await params;
  const tipo = param((await searchParams).tipo) === 'venta' ? 'venta' : 'compra';
  const empresa = await requerirEmpresa(empresaId);
  if (!puedeEscribir(empresa.rol)) return <p className="text-tenue">Tu rol no permite registrar documentos.</p>;
  const [plan, centros] = await Promise.all([planDeEmpresa(empresaId), centrosDeEmpresa(empresaId)]);
  return <FormDocumento key={tipo} empresaId={empresaId} tipo={tipo} cuentas={plan} centros={centros} />;
}
