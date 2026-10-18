import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { finiquitosDeEmpresa } from '@/lib/datos/remuneraciones';
import type { FormFiniquito } from '@/remuneraciones/finiquito';
import { datosFormulario } from '../../cargar-form';
import { FormularioFiniquito } from '../../form';

export const metadata: Metadata = { title: 'Editar finiquito' };

export default async function EditarFiniquitoPage({ params }: PageProps<'/e/[empresaId]/remuneraciones/finiquitos/[id]/editar'>) {
  const { empresaId, id } = await params;
  const empresa = await requerirEmpresa(empresaId);
  const [f] = await finiquitosDeEmpresa(empresaId, id);
  if (!f) notFound();
  if (!puedeEscribir(empresa.rol)) redirect(`/e/${empresaId}/remuneraciones/finiquitos/${id}`);
  const contabilizado = !!(f.asiento && !f.asiento.anulado);
  const d = await datosFormulario(empresaId, f.fecha_termino);
  return (
    <div className="space-y-4">
      <Link href={`/e/${empresaId}/remuneraciones/finiquitos/${id}`} className="text-sm text-tenue hover:text-texto">← Volver al documento</Link>
      <h1 className="text-xl font-semibold">Editar finiquito</h1>
      {contabilizado ? <p className="tarjeta p-6 text-amber-500">🔒 Este finiquito está contabilizado (asiento N° {f.asiento!.numero}). Anula ese asiento en el libro diario para modificarlo.</p> : (
        <FormularioFiniquito empresaId={empresaId} id={id} datos={d} trabajadores={d.trabajadores} inicial={f.datos as unknown as FormFiniquito} textoInicial={f.texto || ''} />
      )}
    </div>
  );
}
