import type { Metadata } from 'next';
import Link from 'next/link';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { hoyISO, param } from '@/lib/formato';
import { datosFormulario } from '../cargar-form';
import { FormularioFiniquito } from '../form';

export const metadata: Metadata = { title: 'Nuevo finiquito' };

export default async function NuevoFiniquitoPage({ params, searchParams }: PageProps<'/e/[empresaId]/remuneraciones/finiquitos/nuevo'>) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const empresa = await requerirEmpresa(empresaId);
  if (!puedeEscribir(empresa.rol)) redirect(`/e/${empresaId}/remuneraciones/finiquitos`);
  const d = await datosFormulario(empresaId, hoyISO());
  const activos = d.trabajadores.filter((t) => t.activo);
  const t = activos.find((x) => x.id === param(sp.trab)) || activos[0];
  return (
    <div className="space-y-4">
      <Link href={`/e/${empresaId}/remuneraciones/finiquitos`} className="text-sm text-tenue hover:text-texto">← Finiquitos</Link>
      <h1 className="text-xl font-semibold">Nuevo finiquito</h1>
      {!t ? <p className="tarjeta p-6 text-tenue">Registra trabajadores primero.</p> : (
        <FormularioFiniquito empresaId={empresaId} id={null} datos={d} trabajadores={activos}
          inicial={{ trab: t.id, fechaTermino: t.lre?.fechaTermino || hoyISO(), fecha: hoyISO(), causal: '159-2', numeral160: '', fechaAviso: '', hechos: '', uf: d.uf,
            incGrat: true, incColacion: true, incMovilizacion: true, baseManual: '', incMesTermino: false, montoMesTermino: '', diasFeriadoManual: '', aniosManual: '', afcManual: '',
            haberesExtra: [], descuentosExtra: [], formaPago: 'transferencia electrónica', ciudad: d.empresa.ciudad || '', plantillaId: '', actualizarFicha: true, codigoLRE: t.lre?.causalTermino || '' }}
          textoInicial="" />
      )}
    </div>
  );
}
