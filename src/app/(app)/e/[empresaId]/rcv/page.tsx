import type { Metadata } from 'next';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { planDeEmpresa, centrosDeEmpresa } from '@/lib/datos/maestros';
import { param } from '@/lib/formato';
import { ImportadorRCV } from './importador';

export const metadata: Metadata = { title: 'Importar RCV' };

export default async function RcvPage({ params, searchParams }: PageProps<'/e/[empresaId]/rcv'>) {
  const { empresaId } = await params;
  const tipo = param((await searchParams).tipo) === 'venta' ? 'venta' : 'compra';
  const empresa = await requerirEmpresa(empresaId);
  if (!puedeEscribir(empresa.rol)) return <p className="text-tenue">Tu rol no permite registrar documentos.</p>;
  const [plan, centros] = await Promise.all([planDeEmpresa(empresaId), centrosDeEmpresa(empresaId)]);
  return <ImportadorRCV key={tipo} empresaId={empresaId} tipo={tipo} cuentas={plan} centros={centros} />;
}
