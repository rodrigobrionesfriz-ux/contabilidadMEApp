import type { Metadata } from 'next';
import Link from 'next/link';
import { requerirEmpresa } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { saldosDesde, balanceGeneral, estadoResultados, comparativo, type FilaSuma, type LineaEF } from '@/estados/eeff';
import { regimenInfo } from '@/estados/regimenes';
import { clp, param, rangoAnio, MESES } from '@/lib/formato';
import { SelectorPeriodo } from '@/components/selector-periodo';
import { BotonImprimir } from '@/components/boton-imprimir';

export const metadata: Metadata = { title: 'Estados financieros' };

const monto = (v: number) => (v < 0 ? `(${clp(-v)})` : clp(v));

export default async function EstadosPage({ params, searchParams }: PageProps<'/e/[empresaId]/estados'>) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const anio = Number(param(sp.anio)) || new Date().getFullYear();
  const mes = Number(param(sp.mes)) || 0;
  const vista = param(sp.vista) === 'resultados' ? 'resultados' : 'balance';
  const cmp = Number(param(sp.cmp)) || 0;
  await requerirEmpresa(empresaId);
  const supabase = await crearClienteServidor();
  const { desde, hasta } = rangoAnio(anio, mes || undefined);
  const consultas = [supabase.rpc('saldos_periodo', { p_empresa: empresaId, p_desde: desde, p_hasta: hasta, p_excluir_cierre: true })];
  if (cmp) { const r = rangoAnio(cmp, mes || undefined); consultas.push(supabase.rpc('saldos_periodo', { p_empresa: empresaId, p_desde: r.desde, p_hasta: r.hasta, p_excluir_cierre: true })); }
  const [actual, anterior] = await Promise.all(consultas);
  if (actual.error) throw new Error(actual.error.message);
  const { data: emp } = await supabase.from('empresas').select('razon_social,rut,regimen,tasa_renta').eq('id', empresaId).single();
  const M = saldosDesde((actual.data ?? []) as FilaSuma[]);
  const MB = anterior?.data ? saldosDesde(anterior.data as FilaSuma[]) : null;
  const reg = regimenInfo(emp?.regimen);
  const b = balanceGeneral(M);
  const r = estadoResultados(M, reg.k, anio, emp?.tasa_renta == null ? null : Number(emp.tasa_renta));
  const fecha = mes ? new Date(Date.UTC(anio, mes, 0)) : new Date(Date.UTC(anio, 11, 31));
  const alDia = `${fecha.getUTCDate()} de ${MESES[fecha.getUTCMonth()].toLowerCase()} de ${anio}`;
  const q = (c: Record<string, string | number>) => '?' + new URLSearchParams(Object.entries({ anio, mes: mes || '', vista, cmp: cmp || '', ...c }).filter(([, v]) => v !== '' && v !== 0).map(([k, v]) => [k, String(v)])).toString();
  const filas = (ls: LineaEF[]) => ls.length ? ls.map((l) => (
    <tr key={l.cuenta}><td className="py-0.5 pl-4"><span className="num text-[10px] text-tenue">{l.cuenta}</span> {l.nombre}{l.correctora ? <span className="text-tenue"> (−)</span> : l.invertida ? <span className="text-amber-500" title="Saldo contrario a la naturaleza de la cuenta: revísala"> ⚠</span> : null}</td>
      <td className={`num text-right ${l.valor < 0 ? 'text-peligro' : ''}`}>{monto(l.valor)}</td></tr>
  )) : <tr><td className="py-0.5 pl-4 text-tenue">Sin movimientos</td><td className="text-right">–</td></tr>;
  const total = (nm: string, v: number, fuerte = false) => <tr className={`border-t border-borde font-semibold ${fuerte ? 'text-sm' : ''}`}><td className="py-1">{nm}</td><td className="num text-right">{clp(v)}</td></tr>;
  const titulo = (nm: string) => <tr><td colSpan={2} className="pt-3 pb-1 text-xs font-semibold tracking-wide text-tenue uppercase">{nm}</td></tr>;
  const cmpFilas = MB ? comparativo(M, MB, vista) : null;

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Estados financieros</h1>
          <div className="mt-2 flex gap-1 text-sm">
            <Link href={q({ vista: 'balance' })} className={`rounded-md px-3 py-1.5 ${vista === 'balance' ? 'bg-panel-2 font-medium text-acento' : 'text-tenue hover:text-texto'}`}>⚖️ Balance general</Link>
            <Link href={q({ vista: 'resultados' })} className={`rounded-md px-3 py-1.5 ${vista === 'resultados' ? 'bg-panel-2 font-medium text-acento' : 'text-tenue hover:text-texto'}`}>📈 Estado de resultados</Link>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <SelectorPeriodo anio={anio} mes={mes} extra={{ vista, cmp: cmp ? String(cmp) : '' }} />
          <form className="flex items-end gap-2">
            {Object.entries({ anio: String(anio), mes: mes ? String(mes) : '', vista }).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
            <div><label className="etiqueta" htmlFor="cmp">Comparar con</label>
              <select id="cmp" name="cmp" defaultValue={cmp || ''} className="campo w-32"><option value="">Sin comparar</option>{Array.from({ length: 7 }, (_, i) => anio - 1 - i).map((y) => <option key={y} value={y}>{y}</option>)}</select></div>
            <button className="boton-sec">Comparar</button>
          </form>
          <BotonImprimir />
        </div>
      </div>

      {cmpFilas && (
        <section className="tarjeta mx-auto max-w-3xl p-4 text-sm">
          <h2 className="mb-2 font-semibold">📊 Comparativo {anio} vs {cmp}{mes ? ` (enero a ${MESES[mes - 1].toLowerCase()})` : ''}</h2>
          <table className="w-full text-xs">
            <thead className="text-left text-tenue"><tr className="border-b border-borde"><th className="py-1">Concepto</th><th className="text-right">{anio}</th><th className="text-right">{cmp}</th><th className="text-right">Var. %</th></tr></thead>
            <tbody>{cmpFilas.map((f) => (
              <tr key={f.nm} className={`border-b border-borde/30 ${f.sig ? 'bg-amber-500/10' : ''}`}><td className="py-1">{f.sig ? '⚡ ' : ''}{f.nm}</td><td className="num text-right">{clp(f.actual)}</td><td className="num text-right text-tenue">{clp(f.anterior)}</td>
                <td className={`num text-right font-semibold ${f.tono === 'positivo' ? 'text-acento' : f.tono === 'negativo' ? 'text-peligro' : 'text-tenue'}`}>{f.txt}</td></tr>
            ))}</tbody>
          </table>
          <p className="mt-2 text-[10px] text-tenue">⚡ Variación de 20% o más. El signo es aritmético: no indica por sí solo mejora o empeoramiento.</p>
        </section>
      )}

      <article className="hoja tarjeta mx-auto max-w-4xl space-y-4 p-8 text-xs">
        <div className="text-center">
          <div className="text-base font-bold">{emp?.razon_social}</div>
          <div className="text-tenue">RUT {emp?.rut}</div>
          <div className="mt-1 text-sm">{vista === 'balance' ? `Balance general al ${alDia}` : `Estado de resultados · ${mes ? `enero a ${MESES[mes - 1].toLowerCase()} de ${anio}` : `año ${anio}`}`}</div>
          <div className="text-tenue">{reg.corto} · {reg.nm}</div>
        </div>
        {vista === 'balance' ? (
          <>
            <div className="grid gap-8 md:grid-cols-2">
              <table className="w-full"><tbody>
                {titulo('Activos corrientes')}{filas(b.activoCorriente.lineas)}{total('Total activos corrientes', b.activoCorriente.total)}
                {titulo('Activos no corrientes')}{filas(b.activoNoCorriente.lineas)}{total('Total activos no corrientes', b.activoNoCorriente.total)}
                {total('TOTAL ACTIVOS', b.totalActivos, true)}
              </tbody></table>
              <table className="w-full"><tbody>
                {titulo('Pasivos corrientes')}{filas(b.pasivoCorriente.lineas)}{total('Total pasivos corrientes', b.pasivoCorriente.total)}
                {titulo('Pasivos no corrientes')}{filas(b.pasivoNoCorriente.lineas)}{total('Total pasivos no corrientes', b.pasivoNoCorriente.total)}
                {total('Total pasivos', b.totalPasivos)}
                {titulo('Patrimonio')}{filas(b.patrimonio.lineas)}
                <tr><td className="py-0.5 pl-4">Resultado del ejercicio</td><td className={`num text-right ${b.resultado < 0 ? 'text-peligro' : 'text-acento'}`}>{monto(b.resultado)}</td></tr>
                {total('Total patrimonio', b.totalPatrimonio)}
                {total('TOTAL PASIVOS + PATRIMONIO', b.totalPasivosPatrimonio, true)}
              </tbody></table>
            </div>
            <p className={`no-print ${b.cuadra ? 'text-acento' : 'text-amber-500'}`}>{b.cuadra ? '✅ Balance cuadrado' : `⚠️ Diferencia: ${clp(b.diferencia)}`}</p>
            {b.invertidas.length > 0 && (
              <div className="no-print rounded-md border border-amber-500/40 p-3 text-amber-500">
                ⚠️ {b.invertidas.length === 1 ? 'Una cuenta tiene' : `${b.invertidas.length} cuentas tienen`} saldo contrario a su naturaleza y aparece{b.invertidas.length === 1 ? '' : 'n'} restando, entre paréntesis:
                {b.invertidas.map((cd) => <div key={cd} className="num">{cd} {M[cd].nombre} · {clp(Math.abs(M[cd].saldo))} {cd.startsWith('1') ? 'acreedor' : 'deudor'}</div>)}
                <p className="mt-1">El balance cuadra igual, pero casi siempre es un dato pendiente: un banco con pagos sin depósitos o sin apertura, un proveedor sobrepagado, un cliente con notas de crédito de más. Revisa su mayor.</p>
              </div>
            )}
          </>
        ) : (
          <>
            <table className="mx-auto w-full max-w-2xl"><tbody>
              {r.niveles.map((n) => n.subtotal ? (
                <tr key={n.k} className="border-t border-borde font-semibold"><td className="py-1.5">= {n.nm}</td><td className={`num text-right ${n.valor < 0 ? 'text-peligro' : ''}`}>{clp(n.valor)}</td></tr>
              ) : (
                <tr key={n.k}><td className="py-1" colSpan={2}>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none justify-between">
                      <span>{n.detalle?.length ? <span className="text-tenue group-open:hidden">▸ </span> : null}{n.detalle?.length ? <span className="hidden text-tenue group-open:inline">▾ </span> : null}{n.signo && <span className="text-tenue">{n.signo} </span>}{n.nm}</span>
                      <span className="num">{clp(n.valor)}</span>
                    </summary>
                    {n.detalle?.map((d) => <div key={d.cuenta} className="flex justify-between pl-6 text-tenue"><span><span className="num text-[10px]">{d.cuenta}</span> {d.nombre}</span><span className="num">{clp(d.valor)}</span></div>)}
                  </details>
                </td></tr>
              ))}
              <tr><td className="py-1"><span className="text-tenue">− </span>Impuesto a la renta ({String(r.tasa).replace('.', ',')}%){r.estimado && <span className="text-amber-500"> estimado</span>}</td><td className="num text-right">{clp(r.impuesto)}</td></tr>
              <tr className={`border-t-2 border-borde text-sm font-bold ${r.utilidadNeta < 0 ? 'text-peligro' : 'text-acento'}`}><td className="py-2">{r.utilidadNeta < 0 ? 'PÉRDIDA' : 'UTILIDAD'} NETA DEL EJERCICIO</td><td className="num text-right">{clp(r.utilidadNeta)}</td></tr>
            </tbody></table>
            <p className="text-center text-tenue">Margen bruto {String(r.margenes.bruto).replace('.', ',')}% · operacional {String(r.margenes.operacional).replace('.', ',')}% · neto {String(r.margenes.neto).replace('.', ',')}%</p>
            {r.estimado && <p className="no-print text-tenue">ℹ️ El impuesto a la renta es una estimación ({String(r.tasa).replace('.', ',')}% del resultado antes de impuesto): no hay cuenta del grupo 36 contabilizada. La tasa se cambia en Configuración → Empresa.</p>}
          </>
        )}
        <p className="no-print text-[10px] text-tenue">Excluye asientos anulados y el asiento de cierre del ejercicio (así se ve el resultado aunque el año esté cerrado). Cuentas agrupadas por código: 11/12 activos, 21/22 pasivos, 23 patrimonio, 3 costos y gastos, 4 ingresos.</p>
      </article>
    </div>
  );
}
