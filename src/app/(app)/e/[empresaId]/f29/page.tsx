import type { Metadata } from 'next';
import Link from 'next/link';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { entradaF29, asientosF29 } from '@/lib/datos/f29';
import { cuentasDeTesoreria } from '@/lib/datos/auxiliares';
import { calcularF29Anual, diferenciasF29 } from '@/tributario/f29';
import { clp, param, MESES } from '@/lib/formato';
import { DetalleF29 } from './detalle';

export const metadata: Metadata = { title: 'F29' };

export default async function F29Page({ params, searchParams }: PageProps<'/e/[empresaId]/f29'>) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const anio = Number(param(sp.anio)) || new Date().getFullYear();
  const mes = Number(param(sp.mes)) || 0;
  const empresa = await requerirEmpresa(empresaId);
  const [entrada, asientos, tesoreria] = await Promise.all([entradaF29(empresaId, anio), asientosF29(empresaId, anio), cuentasDeTesoreria(empresaId)]);
  const meses = calcularF29Anual(entrada);
  const tot = (k: 'debito' | 'creditoMes' | 'ivaAPagar' | 'ppm' | 'retencionHon' | 'iusc' | 'totalPagar') => meses.reduce((s, m) => s + m[k], 0);
  const sel = mes ? meses[mes - 1] : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Formulario 29 · {anio}</h1>
          <p className="text-sm text-tenue">
            Tasa PPM {String(entrada.tasaPPM).replace('.', ',')}%{entrada.tasaPPM === 0 && <> · <Link href={`/e/${empresaId}/empresa`} className="text-aviso underline">configúrala en Empresa</Link></>}
            {' '}· Calculado desde los libros de compras, ventas, honorarios y remuneraciones.
          </p>
        </div>
        <div className="flex gap-1 text-sm">
          {[anio - 1, anio, anio + 1].map((a) => <Link key={a} href={`?anio=${a}`} className={`rounded px-3 py-1 ${a === anio ? 'bg-panel-2 text-acento' : 'text-tenue'}`}>{a}</Link>)}
        </div>
      </div>
      <div className="tarjeta overflow-x-auto">
        <table className="w-full min-w-[1100px] text-xs">
          <thead className="text-left text-tenue uppercase">
            <tr className="border-b border-borde">
              <th className="px-3 py-2">Mes</th><th className="px-2 py-2 text-right">Débito</th><th className="px-2 py-2 text-right">Crédito</th>
              <th className="px-2 py-2 text-right">Remanente ant.</th><th className="px-2 py-2 text-right">IVA a pagar</th><th className="px-2 py-2 text-right">Remanente</th>
              <th className="px-2 py-2 text-right">PPM</th><th className="px-2 py-2 text-right">Ret. hon.</th><th className="px-2 py-2 text-right">Imp. único</th>
              <th className="px-2 py-2 text-right">Total F29</th><th className="px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {meses.map((m) => {
              const dif = diferenciasF29(m, m.declaracion);
              const vacio = !m.nDocsV && !m.nDocsC && !m.retencionHon && !m.iusc && !m.remanenteAnt;
              return (
                <tr key={m.m} className={`border-b border-borde/40 hover:bg-panel-2 ${mes === m.m ? 'bg-panel-2' : ''} ${vacio ? 'opacity-40' : ''}`}>
                  <td className="px-3 py-1.5"><Link href={`?anio=${anio}&mes=${m.m}`} className="font-medium hover:text-acento">{MESES[m.m - 1]}</Link></td>
                  <td className="num px-2 py-1.5 text-right">{clp(m.debitoTotal)}</td>
                  <td className="num px-2 py-1.5 text-right">{clp(m.creditoMes)}</td>
                  <td className="num px-2 py-1.5 text-right text-tenue" title={m.remanenteCorregido ? 'Remanente corregido a mano en este mes' : undefined}>{m.remanenteCorregido ? '✎ ' : ''}{m.remanenteReaj ? clp(m.remanenteReaj) : ''}</td>
                  <td className="num px-2 py-1.5 text-right">{m.ivaAPagar ? clp(m.ivaAPagar) : ''}</td>
                  <td className="num px-2 py-1.5 text-right text-acento">{m.remanente ? clp(m.remanente) : ''}</td>
                  <td className="num px-2 py-1.5 text-right">{m.ppm ? clp(m.ppm) : ''}</td>
                  <td className="num px-2 py-1.5 text-right">{m.retencionHon ? clp(m.retencionHon) : ''}</td>
                  <td className="num px-2 py-1.5 text-right">{m.iusc ? clp(m.iusc) : ''}</td>
                  <td className="num px-2 py-1.5 text-right font-semibold">{clp(m.totalPagar)}</td>
                  <td className="px-3 py-1.5">
                    {m.desactualizado
                      ? <span className="text-aviso" title="Una corrección anterior cambió su remanente: rectificar">⚠ Rectificar</span>
                      : m.declaracion?.estado === 'presentado'
                      ? <span className={dif.length ? 'text-aviso' : 'text-acento'}>✓ Presentado{dif.length ? ` · ${dif.length} dif.` : ''}</span>
                      : m.declaracion ? <span className="text-tenue">Borrador</span> : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="font-semibold">
            <tr className="border-t border-borde">
              <td className="px-3 py-1.5">Año</td><td className="num px-2 py-1.5 text-right">{clp(meses.reduce((s, m) => s + m.debitoTotal, 0))}</td>
              <td className="num px-2 py-1.5 text-right">{clp(tot('creditoMes'))}</td><td /><td className="num px-2 py-1.5 text-right">{clp(tot('ivaAPagar'))}</td><td />
              <td className="num px-2 py-1.5 text-right">{clp(tot('ppm'))}</td><td className="num px-2 py-1.5 text-right">{clp(tot('retencionHon'))}</td>
              <td className="num px-2 py-1.5 text-right">{clp(tot('iusc'))}</td><td className="num px-2 py-1.5 text-right">{clp(tot('totalPagar'))}</td><td />
            </tr>
          </tfoot>
        </table>
      </div>
      {sel ? (
        <DetalleF29 key={`${anio}-${mes}`} empresaId={empresaId} anio={anio} m={sel} escribe={puedeEscribir(empresa.rol)} admin={empresa.rol === 'admin'}
          esEnero={mes === 1} remanenteDesdeDic={!!entrada.anteriores[`${anio - 1}-12`]}
          asientos={asientos.filter((a) => a.origen_id.endsWith(`f29:${anio}-${String(mes).padStart(2, '0')}`))} tesoreria={tesoreria} />
      ) : (
        <p className="text-sm text-tenue">Elige un mes para ver el detalle por código, declarar, generar la compensación de IVA y registrar el pago.</p>
      )}
    </div>
  );
}
