import type { Metadata } from 'next';
import Link from 'next/link';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { contextoRemuneraciones, indicadoresMes } from '@/lib/datos/remuneraciones';
import { liquidacionMes } from '@/remuneraciones/calculo';
import { clp, param, MESES } from '@/lib/formato';
import { SelectorPeriodo } from '@/components/selector-periodo';
import { Pestanas } from './pestanas';
import { ImportarTrabajadores } from './importar';

export const metadata: Metadata = { title: 'Remuneraciones' };

export default async function RemuneracionesPage({ params, searchParams }: PageProps<'/e/[empresaId]/remuneraciones'>) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const anio = Number(param(sp.anio)) || new Date().getFullYear();
  const mes = Number(param(sp.mes)) || new Date().getMonth() + 1;
  const empresa = await requerirEmpresa(empresaId);
  const { ctx, trabajadores, libros, indicadores } = await contextoRemuneraciones(empresaId, anio);
  const periodo = `${anio}-${String(mes).padStart(2, '0')}`;
  const libro = libros.find((l) => l.periodo === periodo);
  const { uf, utm, ufTabla } = libro ? { uf: Number(libro.uf), utm: Number(libro.utm), ufTabla: true } : indicadoresMes(ctx.P, anio, mes, indicadores);
  const filas = trabajadores.map((t) => ({ t, l: t.activo ? liquidacionMes(t, uf, utm, anio, mes, ctx) : null }));
  const activos = filas.filter((f) => f.l);
  const sum = (k: 'totalImponible' | 'totalDescuentos' | 'liquido' | 'costoEmpresa') => activos.reduce((s, f) => s + Number(f.l![k]), 0);
  const escribe = puedeEscribir(empresa.rol);
  const q = `?anio=${anio}&mes=${mes}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Remuneraciones · {MESES[mes - 1]} {anio}</h1>
          <p className="text-sm text-tenue">UF {uf.toLocaleString('es-CL', { minimumFractionDigits: 2 })} · UTM {clp(utm)}{libro ? ' · libro cerrado' : ' · cálculo provisorio con los datos vigentes'}</p>
          {!ufTabla && <p className="text-xs text-aviso">⚠️ Falta la UF del último día de {MESES[mes - 1].toLowerCase()}: se usa la de referencia. <Link href={`/e/${empresaId}/remuneraciones/parametros?anio=${anio}#uf-mensual`} className="underline">Ingresarla</Link></p>}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <SelectorPeriodo anio={anio} mes={mes} etiquetaMes="Mes" conAnioCompleto={false} />
          {escribe && <Link href={`/e/${empresaId}/remuneraciones/trabajador/nuevo`} className="boton">+ Trabajador</Link>}
        </div>
      </div>
      <Pestanas empresaId={empresaId} activa="" query={q} />
      {trabajadores.length === 0 ? (
        <div className="tarjeta space-y-3 p-8 text-center text-tenue">
          <p>Aún no hay trabajadores. Crea el primero con «+ Trabajador» o impórtalos desde el respaldo.</p>
        </div>
      ) : (
        <div className="tarjeta overflow-x-auto">
          <table className="w-full min-w-[960px] text-xs">
            <thead className="text-left text-tenue uppercase">
              <tr className="border-b border-borde">
                <th className="px-3 py-2">Trabajador</th><th className="px-2 py-2">Cargo</th><th className="px-2 py-2 text-right">Días</th>
                <th className="px-2 py-2 text-right">Imponible</th><th className="px-2 py-2 text-right">Descuentos</th><th className="px-2 py-2 text-right">Líquido</th>
                <th className="px-2 py-2 text-right">Costo empresa</th><th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filas.map(({ t, l }) => (
                <tr key={t.id} className={`border-b border-borde/40 ${l ? '' : 'opacity-50'}`}>
                  <td className="px-3 py-1.5"><div className="font-medium">{t.nombre}</div><div className="num text-tenue">{t.rut}{l ? '' : ' · inactivo'}</div></td>
                  <td className="px-2 py-1.5">{t.cargo}</td>
                  <td className="num px-2 py-1.5 text-right">{l ? (l.porHora ? `${l.horas} h` : l.asis?.diasPagados) : ''}</td>
                  <td className="num px-2 py-1.5 text-right">{l ? clp(l.totalImponible) : ''}</td>
                  <td className="num px-2 py-1.5 text-right">{l ? clp(l.totalDescuentos) : ''}</td>
                  <td className={`num px-2 py-1.5 text-right font-semibold ${l && l.liquido < 0 ? 'text-peligro' : ''}`}>{l ? clp(l.liquido) : ''}</td>
                  <td className="num px-2 py-1.5 text-right text-tenue">{l ? clp(l.costoEmpresa) : ''}</td>
                  <td className="space-x-3 px-3 py-1.5 text-right whitespace-nowrap">
                    <Link className="text-tenue hover:text-texto" href={`/e/${empresaId}/remuneraciones/trabajador/${t.id}`}>Ficha</Link>
                    {l && <Link className="text-acento hover:underline" href={`/e/${empresaId}/remuneraciones/liquidacion/${t.id}${q}`}>Liquidación</Link>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="font-semibold">
              <tr className="border-t border-borde"><td className="px-3 py-1.5" colSpan={3}>{activos.length} activos</td>
                <td className="num px-2 py-1.5 text-right">{clp(sum('totalImponible'))}</td><td className="num px-2 py-1.5 text-right">{clp(sum('totalDescuentos'))}</td>
                <td className="num px-2 py-1.5 text-right">{clp(sum('liquido'))}</td><td className="num px-2 py-1.5 text-right">{clp(sum('costoEmpresa'))}</td><td /></tr>
            </tfoot>
          </table>
        </div>
      )}
      {escribe && <ImportarTrabajadores empresaId={empresaId} compacto={trabajadores.length > 0} />}
    </div>
  );
}
