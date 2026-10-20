import type { Metadata } from 'next';
import Link from 'next/link';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { lineasDelMes } from '@/lib/datos/remuneraciones';
import type { LineaLibro, Totales } from '@/remuneraciones/libro';
import { clp, param, MESES } from '@/lib/formato';
import { SelectorPeriodo } from '@/components/selector-periodo';
import { Pestanas } from '../pestanas';
import { AccionesLibro } from './acciones-libro';
import { Declarar } from './declarar';

export const metadata: Metadata = { title: 'Libro de remuneraciones' };

const COLS: [keyof LineaLibro & keyof Totales, string][] = [
  ['base', 'Sueldo'], ['gratificacion', 'Gratif.'], ['otros', 'Otros'], ['totalImponible', 'Imponible'], ['totalNoImponible', 'No imp.'],
  ['descAFP', 'AFP'], ['descSalud', 'Salud'], ['descCesantia', 'Cesantía'], ['iusc', 'Imp. único'], ['anticipo', 'Anticipos'],
  ['liquido', 'Líquido'], ['totalPatronal', 'Aporte patr.'], ['costoEmpresa', 'Costo'],
];

export default async function LibroRemPage({ params, searchParams }: PageProps<'/e/[empresaId]/remuneraciones/libro'>) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const anio = Number(param(sp.anio)) || new Date().getFullYear();
  const mes = Number(param(sp.mes)) || new Date().getMonth() + 1;
  const empresa = await requerirEmpresa(empresaId);
  const { guardado, uf, utm, ufTabla, lineas, totales: tot, previred } = await lineasDelMes(empresaId, anio, mes);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Libro de remuneraciones · {MESES[mes - 1]} {anio}</h1>
          <p className="text-sm text-tenue">{guardado ? `Cerrado el ${new Date(guardado.cerrado_en).toLocaleString('es-CL')}: es la foto de lo pagado y ya no cambia.` : 'Provisorio: se calcula con las fichas vigentes. Al cerrarlo se guarda la foto del mes y se contabiliza.'}</p>
        </div>
        <SelectorPeriodo anio={anio} mes={mes} etiquetaMes="Mes" conAnioCompleto={false} />
      </div>
      <Pestanas empresaId={empresaId} activa="/libro" query={`?anio=${anio}&mes=${mes}`} />
      <AccionesLibro empresaId={empresaId} anio={anio} mes={mes} uf={uf} utm={utm} ufTabla={ufTabla} cerrado={!!guardado} escribe={puedeEscribir(empresa.rol)} admin={empresa.rol === 'admin'} hayLineas={lineas.length > 0} />
      <div className="tarjeta overflow-x-auto">
        <table className="w-full min-w-[1300px] text-[11px]">
          <thead className="text-left text-tenue uppercase">
            <tr className="border-b border-borde"><th className="px-3 py-2">Trabajador</th><th className="px-2 py-2 text-right">Días</th>{COLS.map(([, n]) => <th key={n} className="px-2 py-2 text-right">{n}</th>)}<th /></tr>
          </thead>
          <tbody>
            {lineas.length === 0 && <tr><td colSpan={COLS.length + 3} className="px-3 py-6 text-center text-tenue">Sin trabajadores con remuneraciones en el mes.</td></tr>}
            {lineas.map((l) => (
              <tr key={l.id} className="border-b border-borde/40">
                <td className="px-3 py-1"><div>{l.nombre}</div><div className="num text-tenue">{l.rut}</div></td>
                <td className="num px-2 py-1 text-right">{l.horas != null ? `${l.horas}h` : l.diasPagados}</td>
                {COLS.map(([k]) => <td key={k} className={`num px-2 py-1 text-right ${k === 'liquido' ? 'font-semibold' : ''}`}>{Number(l[k]) ? clp(Number(l[k])) : ''}</td>)}
                <td className="px-2 py-1"><Link className="text-acento hover:underline" href={`/e/${empresaId}/remuneraciones/liquidacion/${l.id}?anio=${anio}&mes=${mes}`}>Ver</Link></td>
              </tr>
            ))}
          </tbody>
          <tfoot className="font-semibold">
            <tr className="border-t border-borde"><td className="px-3 py-1.5">{tot.n} trabajadores</td><td />{COLS.map(([k]) => <td key={k} className="num px-2 py-1.5 text-right">{clp(Number(tot[k]))}</td>)}<td /></tr>
          </tfoot>
        </table>
      </div>
      {lineas.length > 0 && <Declarar empresaId={empresaId} anio={anio} mes={mes} cerrado={!!guardado} admin={empresa.rol === 'admin'} previred={previred} />}
    </div>
  );
}
