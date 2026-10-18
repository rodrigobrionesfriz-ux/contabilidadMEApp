import type { Metadata } from 'next';
import Link from 'next/link';
import { requerirEmpresa } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { clp, fechaCL, param, rangoAnio, MESES } from '@/lib/formato';
import { SelectorPeriodo } from '@/components/selector-periodo';
import { traerTodo } from '@/lib/paginar';

export const metadata: Metadata = { title: 'Libro mayor' };

interface SumaCuenta { cuenta: string; nombre: string; debe: number; haber: number }
interface LineaMayor {
  orden: number; debe: number; haber: number; glosa: string | null; rut_auxiliar: string | null; centro_costo: string | null;
  asientos: { numero: number; fecha: string; glosa: string };
}

export default async function MayorPage({ params, searchParams }: PageProps<'/e/[empresaId]/mayor'>) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const anio = Number(param(sp.anio)) || new Date().getFullYear();
  const mes = Number(param(sp.mes)) || 0;
  const cuenta = param(sp.cuenta).replace(/[^0-9]/g, '');
  await requerirEmpresa(empresaId);
  const supabase = await crearClienteServidor();
  const anual = rangoAnio(anio);
  const periodo = mes ? rangoAnio(anio, mes, mes) : anual;

  const { data: sumas, error } = await supabase.rpc('balance_comprobacion', { p_empresa: empresaId, p_desde: anual.desde, p_hasta: periodo.hasta });
  if (error) throw new Error(error.message);
  const lista = (sumas as SumaCuenta[]).map((s) => ({ ...s, saldo: Number(s.debe) - Number(s.haber) }));

  const movs: (LineaMayor & { saldo: number })[] = [];
  let saldoAnterior = 0;
  const elegida = lista.find((c) => c.cuenta === cuenta);
  if (elegida) {
    const data = await traerTodo((desde, hasta) => supabase
      .from('asiento_lineas')
      .select('id,orden,debe,haber,glosa,rut_auxiliar,centro_costo,asientos!inner(numero,fecha,glosa,anulado,anio)')
      .eq('empresa_id', empresaId).eq('cuenta', cuenta)
      .eq('asientos.anio', anio).eq('asientos.anulado', false)
      .lte('asientos.fecha', periodo.hasta)
      .order('id').range(desde, hasta));
    const filas = (data as unknown as LineaMayor[]).sort((a, b) =>
      a.asientos.fecha.localeCompare(b.asientos.fecha) || a.asientos.numero - b.asientos.numero || a.orden - b.orden);
    let s = 0;
    for (const f of filas) {
      const d = Number(f.debe), h = Number(f.haber);
      if (f.asientos.fecha < periodo.desde) { saldoAnterior += d - h; continue; }
      s = (movs.length ? movs[movs.length - 1].saldo : saldoAnterior) + d - h;
      movs.push({ ...f, debe: d, haber: h, saldo: s });
    }
  }
  const base = `/e/${empresaId}/mayor?anio=${anio}${mes ? `&mes=${mes}` : ''}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-semibold">Libro mayor {mes ? `${MESES[mes - 1]} ` : ''}{anio}</h1>
        <SelectorPeriodo anio={anio} mes={mes} etiquetaMes="Mes" extra={{ cuenta }} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <div className="tarjeta max-h-[70vh] overflow-y-auto">
          {lista.length === 0 && <p className="p-4 text-sm text-tenue">Sin movimientos.</p>}
          {lista.map((c) => (
            <Link key={c.cuenta} href={`${base}&cuenta=${c.cuenta}`}
              className={`flex items-center gap-2 border-b border-borde/40 px-3 py-1.5 text-xs hover:bg-panel-2 ${c.cuenta === cuenta ? 'bg-panel-2 text-acento' : ''}`}>
              <span className="num text-tenue">{c.cuenta}</span>
              <span className="min-w-0 flex-1 truncate">{c.nombre}</span>
              <span className="num">{clp(c.saldo)}</span>
            </Link>
          ))}
        </div>
        <div className="tarjeta overflow-x-auto">
          {!elegida ? (
            <p className="p-6 text-sm text-tenue">Elige una cuenta para ver sus movimientos.</p>
          ) : (
            <table className="w-full min-w-[700px] text-xs">
              <thead className="text-left text-tenue uppercase">
                <tr className="border-b border-borde">
                  <th colSpan={6} className="px-3 py-2 text-sm font-semibold text-texto normal-case">
                    <span className="num">{elegida.cuenta}</span> {elegida.nombre}
                  </th>
                </tr>
                <tr className="border-b border-borde">
                  <th className="px-3 py-1.5">Fecha</th><th className="px-2 py-1.5">N°</th><th className="px-2 py-1.5">Glosa</th>
                  <th className="px-2 py-1.5 text-right">Debe</th><th className="px-2 py-1.5 text-right">Haber</th><th className="px-3 py-1.5 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {mes > 1 && (
                  <tr className="border-b border-borde/40 text-tenue">
                    <td colSpan={5} className="px-3 py-1">Saldo anterior</td>
                    <td className="num px-3 py-1 text-right">{clp(saldoAnterior)}</td>
                  </tr>
                )}
                {movs.map((m, i) => (
                  <tr key={i} className="border-b border-borde/40">
                    <td className="num px-3 py-1">{fechaCL(m.asientos.fecha)}</td>
                    <td className="num px-2 py-1">{m.asientos.numero}</td>
                    <td className="px-2 py-1">
                      {m.asientos.glosa}
                      <span className="ml-1 text-tenue">{[m.rut_auxiliar, m.centro_costo && `CC ${m.centro_costo}`, m.glosa !== m.asientos.glosa && m.glosa].filter(Boolean).join(' · ')}</span>
                    </td>
                    <td className="num px-2 py-1 text-right">{m.debe ? clp(m.debe) : ''}</td>
                    <td className="num px-2 py-1 text-right">{m.haber ? clp(m.haber) : ''}</td>
                    <td className="num px-3 py-1 text-right">{clp(m.saldo)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="font-semibold">
                <tr className="border-t border-borde">
                  <td colSpan={3} className="px-3 py-1.5">Totales del período</td>
                  <td className="num px-2 py-1.5 text-right">{clp(movs.reduce((s, m) => s + m.debe, 0))}</td>
                  <td className="num px-2 py-1.5 text-right">{clp(movs.reduce((s, m) => s + m.haber, 0))}</td>
                  <td className="num px-3 py-1.5 text-right">{clp(movs.length ? movs[movs.length - 1].saldo : saldoAnterior)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
