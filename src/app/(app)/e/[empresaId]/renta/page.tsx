import type { Metadata } from 'next';
import Link from 'next/link';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { contextoRenta } from '@/lib/datos/renta';
import { param } from '@/lib/formato';
import { Renta } from './renta';

export const metadata: Metadata = { title: 'Renta anual (F22)' };

export default async function RentaPage({ params, searchParams }: PageProps<'/e/[empresaId]/renta'>) {
  const { empresaId } = await params;
  const sp = await searchParams;
  // Por defecto, el último año comercial cerrado: la renta se declara en abril del año siguiente.
  const anio = Number(param(sp.anio)) || new Date().getFullYear() - 1;
  const empresa = await requerirEmpresa(empresaId);
  const ctx = await contextoRenta(empresaId, anio);
  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Renta anual · F22 · año comercial {anio}</h1>
          <p className="text-sm text-tenue">Renta líquida imponible e impuesto de primera categoría a partir de la contabilidad del año, sin el asiento de cierre. Ver también <Link className="text-acento hover:underline" href={`/e/${empresaId}/dj?anio=${anio}`}>declaraciones juradas</Link>.</p>
        </div>
        <form className="flex items-end gap-2">
          <div><label className="etiqueta" htmlFor="anio">Año comercial</label>
            <select id="anio" name="anio" defaultValue={anio} className="campo w-28">{Array.from({ length: 8 }, (_, i) => new Date().getFullYear() - i).map((y) => <option key={y} value={y}>{y}</option>)}</select></div>
          <button className="boton-sec">Ver</button>
        </form>
      </div>
      <Renta key={anio} empresaId={empresaId} anio={anio} empresa={ctx.empresa} M={ctx.M} bienes={ctx.bienes} ppmF29={ctx.ppmF29}
        datosIniciales={ctx.datos} lineasMarcadas={ctx.lineasMarcadas} escribe={puedeEscribir(empresa.rol)} guardadoEn={ctx.guardadoEn} />
    </div>
  );
}
