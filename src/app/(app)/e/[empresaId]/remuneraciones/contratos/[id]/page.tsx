import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { contextoContratos } from '@/lib/datos/remuneraciones';
import { datosContrato } from '@/remuneraciones/contrato-dt';
import { FormDatosDT } from './form';

export const metadata: Metadata = { title: 'Datos del contrato' };

export default async function DatosDTPage({ params }: PageProps<'/e/[empresaId]/remuneraciones/contratos/[id]'>) {
  const { empresaId, id } = await params;
  const empresa = await requerirEmpresa(empresaId);
  const c = await contextoContratos(empresaId);
  const t = c.trabajadores.find((x) => x.id === id);
  if (!t) notFound();
  return (
    <div className="space-y-4">
      <Link href={`/e/${empresaId}/remuneraciones/contratos`} className="text-sm text-tenue hover:text-texto">← Contratos</Link>
      <div>
        <h1 className="text-xl font-semibold">Datos del contrato para la DT · {t.nombre}</h1>
        <p className="text-sm text-tenue">{t.rut} · Sueldo, AFP, salud, sexo, nombres e inicio salen de la <Link className="text-acento hover:underline" href={`/e/${empresaId}/remuneraciones/trabajador/${id}`}>ficha</Link>.{!c.empresa.rep || !c.empresa.rutrep ? ' Falta el representante legal de la empresa (Configuración → Empresa).' : ''}</p>
      </div>
      <FormDatosDT empresaId={empresaId} trabajador={t} D={c.D} inicial={datosContrato(t, c.D)} escribe={puedeEscribir(empresa.rol)} />
    </div>
  );
}
