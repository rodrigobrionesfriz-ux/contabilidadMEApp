import type { Metadata } from 'next';
import Link from 'next/link';
import { requerirEmpresa } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { balance8, type SumaCuenta } from '@/lib/balance';
import { clp, param, rangoAnio, MESES } from '@/lib/formato';
import { SelectorPeriodo } from '@/components/selector-periodo';

export const metadata: Metadata = { title: 'Balance' };

const COLS = ['debe', 'haber', 'deudor', 'acreedor', 'activo', 'pasivo', 'perdida', 'ganancia'] as const;
const TITULOS = ['Débitos', 'Créditos', 'Deudor', 'Acreedor', 'Activo', 'Pasivo', 'Pérdida', 'Ganancia'];
const v = (n: number) => (n ? clp(n) : '');

export default async function BalancePage({ params, searchParams }: PageProps<'/e/[empresaId]/balance'>) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const anio = Number(param(sp.anio)) || new Date().getFullYear();
  const mes = Number(param(sp.mes)) || 0;
  const empresa = await requerirEmpresa(empresaId);
  const { desde, hasta } = rangoAnio(anio, mes || undefined);
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('balance_comprobacion', { p_empresa: empresaId, p_desde: desde, p_hasta: hasta });
  if (error) throw new Error(error.message);
  const b = balance8(data as SumaCuenta[]);
  const utilidad = b.resultado >= 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Balance tributario de 8 columnas</h1>
          <p className="text-sm text-tenue">{empresa.razon_social} · {mes ? `enero a ${MESES[mes - 1].toLowerCase()}` : 'ejercicio'} {anio} · excluye anulados</p>
        </div>
        <SelectorPeriodo anio={anio} mes={mes} />
      </div>
      {!b.filas.length ? (
        <div className="tarjeta p-8 text-center text-tenue">Sin movimientos en el período.</div>
      ) : (
        <div className="tarjeta overflow-x-auto">
          <table className="w-full min-w-[980px] text-xs">
            <thead className="text-left text-tenue uppercase">
              <tr className="border-b border-borde">
                <th className="px-2 py-2">Cuenta</th>
                {TITULOS.map((t) => <th key={t} className="px-2 py-2 text-right">{t}</th>)}
              </tr>
            </thead>
            <tbody>
              {b.filas.map((f) => (
                <tr key={f.cuenta} className="border-b border-borde/40 hover:bg-panel-2">
                  <td className="max-w-[240px] truncate px-2 py-1" title={f.nombre}>
                    <Link href={`/e/${empresaId}/mayor?anio=${anio}${mes ? `&mes=${mes}` : ''}&cuenta=${f.cuenta}`} className="hover:text-acento">
                      <span className="num text-tenue">{f.cuenta}</span> {f.nombre}
                    </Link>
                  </td>
                  {COLS.map((c) => <td key={c} className="num px-2 py-1 text-right">{v(f[c])}</td>)}
                </tr>
              ))}
            </tbody>
            <tfoot className="font-semibold">
              <tr className="border-t border-borde">
                <td className="px-2 py-1.5">Sumas</td>
                {COLS.map((c) => <td key={c} className="num px-2 py-1.5 text-right">{clp(b.sumas[c])}</td>)}
              </tr>
              <tr className="text-tenue">
                <td className="px-2 py-1.5">{utilidad ? 'Utilidad del ejercicio' : 'Pérdida del ejercicio'}</td>
                <td colSpan={4} />
                <td className="num px-2 py-1.5 text-right">{!utilidad ? clp(-b.resultado) : ''}</td>
                <td className="num px-2 py-1.5 text-right">{utilidad ? clp(b.resultado) : ''}</td>
                <td className="num px-2 py-1.5 text-right">{utilidad ? clp(b.resultado) : ''}</td>
                <td className="num px-2 py-1.5 text-right">{!utilidad ? clp(-b.resultado) : ''}</td>
              </tr>
              <tr>
                <td className="px-2 py-1.5">Totales</td>
                <td className="num px-2 py-1.5 text-right">{clp(b.sumas.debe)}</td>
                <td className="num px-2 py-1.5 text-right">{clp(b.sumas.haber)}</td>
                <td className="num px-2 py-1.5 text-right">{clp(b.sumas.deudor)}</td>
                <td className="num px-2 py-1.5 text-right">{clp(b.sumas.acreedor)}</td>
                <td className="num px-2 py-1.5 text-right">{clp(b.sumas.activo + (utilidad ? 0 : -b.resultado))}</td>
                <td className="num px-2 py-1.5 text-right">{clp(b.sumas.pasivo + (utilidad ? b.resultado : 0))}</td>
                <td className="num px-2 py-1.5 text-right">{clp(b.sumas.perdida + (utilidad ? b.resultado : 0))}</td>
                <td className="num px-2 py-1.5 text-right">{clp(b.sumas.ganancia + (utilidad ? 0 : -b.resultado))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {b.filas.length > 0 && (
        <p className={`text-sm ${b.sumas.debe === b.sumas.haber ? 'text-acento' : 'text-peligro'}`}>
          {b.sumas.debe === b.sumas.haber ? '✓ Débitos y créditos cuadran.' : `⚠️ Diferencia entre débitos y créditos: ${clp(b.sumas.debe - b.sumas.haber)}`}
        </p>
      )}
    </div>
  );
}
