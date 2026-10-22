import type { Metadata } from 'next';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { clp, param, MESES } from '@/lib/formato';
import { SelectorPeriodo } from '@/components/selector-periodo';
import { cargarDiario, TablaDiario } from '../../../e/[empresaId]/diario/tabla';
import { IrANumero } from '../../../e/[empresaId]/diario/flotante';
import { anioContable } from '@/lib/anio-contable';

export const metadata: Metadata = { title: 'Libro diario (ventana)' };

/** Libro diario para la ventana flotante: sin barra ni menú, encabezado compacto y fijo. */
export default async function DiarioFlotante({ params, searchParams }: PageProps<'/v/[empresaId]/diario'>) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const anio = Number(param(sp.anio)) || await anioContable();
  const mes = Number(param(sp.mes)) || 0;
  const empresa = await requerirEmpresa(empresaId);
  const datos = await cargarDiario(empresaId, anio, mes);
  return (
    <div className="flex h-dvh flex-col gap-2 p-2">
      <header className="flex shrink-0 flex-wrap items-end justify-between gap-2 text-sm">
        <div className="min-w-0">
          <div className="truncate text-[11px] text-tenue">{empresa.razon_social}</div>
          <h1 className="font-semibold">Libro diario {mes ? `${MESES[mes - 1]} ` : ''}{anio} <span className="text-xs font-normal text-tenue">· {datos.vigentes} asientos · <span className="num">{clp(datos.total)}</span></span></h1>
        </div>
        <div className="flex flex-wrap items-end gap-2 [&_.campo]:py-1 [&_.campo]:text-xs [&_.etiqueta]:text-[10px]">
          <IrANumero />
          <SelectorPeriodo anio={anio} mes={mes} etiquetaMes="Mes" />
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <TablaDiario empresaId={empresaId} datos={datos} escribe={puedeEscribir(empresa.rol)} flotante />
      </div>
    </div>
  );
}
