import type { Metadata } from 'next';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { clp, param, MESES } from '@/lib/formato';
import { SelectorPeriodo } from '@/components/selector-periodo';
import { cargarDiario, TablaDiario } from './tabla';
import { BotonFlotante, IrANumero } from './flotante';

export const metadata: Metadata = { title: 'Libro diario' };

export default async function DiarioPage({ params, searchParams }: PageProps<'/e/[empresaId]/diario'>) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const anio = Number(param(sp.anio)) || new Date().getFullYear();
  const mes = Number(param(sp.mes)) || 0;
  const empresa = await requerirEmpresa(empresaId);
  const datos = await cargarDiario(empresaId, anio, mes);

  return (
    <div className="max-w-[1100px] space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Libro diario {mes ? `${MESES[mes - 1]} ` : ''}{anio}</h1>
          <p className="text-sm text-tenue">{datos.vigentes} asientos vigentes · total debe/haber <span className="num text-texto">{clp(datos.total)}</span></p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <SelectorPeriodo anio={anio} mes={mes} etiquetaMes="Mes" />
          <BotonFlotante url={`/v/${empresaId}/diario?anio=${anio}${mes ? `&mes=${mes}` : ''}`} />
        </div>
      </div>
      <IrANumero />
      <TablaDiario empresaId={empresaId} datos={datos} escribe={puedeEscribir(empresa.rol)} />
    </div>
  );
}
