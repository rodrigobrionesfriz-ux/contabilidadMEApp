import type { Metadata } from 'next';
import Link from 'next/link';
import { requerirEmpresa } from '@/lib/auth';
import { saldosAuxiliar } from '@/lib/datos/auxiliares';
import { BUCKETS, diasEntre, totalesAging, type TipoAuxiliar } from '@/auxiliares/saldos';
import { clp, fechaCL, hoyISO, param } from '@/lib/formato';

export const metadata: Metadata = { title: 'Auxiliares' };
const COLOR: Record<string, string> = { aldia: 'text-acento', d30: 'text-texto', d60: 'text-aviso', d90: 'text-aviso', d120: 'text-peligro', mas: 'text-peligro' };

export default async function AuxiliaresPage({ params, searchParams }: PageProps<'/e/[empresaId]/auxiliares'>) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const t = param(sp.tipo);
  const tipo: TipoAuxiliar = t === 'cliente' || t === 'honorario' ? t : 'proveedor';
  const hoy = hoyISO();
  const hasta = /^\d{4}-\d{2}-\d{2}$/.test(param(sp.hasta)) ? param(sp.hasta) : hoy;
  const q = param(sp.q).trim().toLowerCase();
  await requerirEmpresa(empresaId);
  const todos = await saldosAuxiliar(empresaId, tipo, hasta, hasta);
  const saldos = todos.filter((s) => Math.abs(s.saldo) >= 1 || s.items.length)
    .filter((s) => !q || `${s.razon} ${s.rut}`.toLowerCase().includes(q));
  const ag = totalesAging(saldos);
  const nombre = tipo === 'cliente' ? 'Clientes' : tipo === 'honorario' ? 'Honorarios' : 'Proveedores';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Auxiliar de {nombre.toLowerCase()}</h1>
          <p className="text-sm text-tenue">Saldos al {fechaCL(hasta)} · {tipo === 'cliente' ? 'por cobrar' : 'por pagar'} · antigüedad según vencimiento</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex gap-1 rounded-md border border-borde p-1 text-sm">
            {(['proveedor', 'honorario', 'cliente'] as const).map((x) => (
              <Link key={x} href={`?tipo=${x}&hasta=${hasta}`} className={`rounded px-3 py-1 ${tipo === x ? 'bg-panel-2 text-acento' : 'text-tenue'}`}>
                {x === 'proveedor' ? 'Proveedores' : x === 'honorario' ? 'Honorarios' : 'Clientes'}
              </Link>
            ))}
          </div>
          <form className="flex items-end gap-2">
            <input type="hidden" name="tipo" value={tipo} />
            <div><label className="etiqueta" htmlFor="hasta">Al</label><input id="hasta" name="hasta" type="date" defaultValue={hasta} className="campo w-40" /></div>
            <input name="q" defaultValue={q} placeholder="Nombre o RUT" className="campo w-44" aria-label="Buscar" />
            <button className="boton-sec" type="submit">Ver</button>
          </form>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-7">
        <div className="tarjeta p-3"><div className="text-[10px] text-tenue uppercase">Total</div><div className="num font-semibold">{clp(ag.total)}</div></div>
        {BUCKETS.map((b) => (
          <div key={b.k} className="tarjeta p-3">
            <div className="text-[10px] text-tenue uppercase">{b.lbl}{b.k !== 'aldia' ? ' días' : ''}</div>
            <div className={`num font-semibold ${COLOR[b.k]}`}>{clp(ag.buckets[b.k])}</div>
          </div>
        ))}
      </div>

      {saldos.length === 0 ? (
        <div className="tarjeta p-8 text-center text-tenue">Sin saldos pendientes.</div>
      ) : (
        <div className="tarjeta divide-y divide-borde">
          {saldos.map((s) => (
            <details key={s.rut} className="group">
              <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-2.5 hover:bg-panel-2">
                <span className="text-tenue group-open:rotate-90">▸</span>
                <span className="min-w-0 flex-1"><span className="font-medium">{s.razon || 'Sin nombre'}</span> <span className="num text-xs text-tenue">{s.rut}</span></span>
                <span className="hidden gap-3 text-xs md:flex">
                  {BUCKETS.filter((b) => Math.abs(s.buckets[b.k]) >= 1).map((b) => <span key={b.k} className={`num ${COLOR[b.k]}`}>{b.lbl}: {clp(s.buckets[b.k])}</span>)}
                </span>
                <span className={`num w-32 text-right font-semibold ${s.saldo < 0 ? 'text-aviso' : ''}`}>{clp(s.saldo)}</span>
              </summary>
              <div className="space-y-3 px-4 pt-1 pb-4 pl-10 text-xs">
                <Link className="text-acento hover:underline" href={`/e/${empresaId}/auxiliares/estado?tipo=${tipo}&rut=${encodeURIComponent(s.rut)}&hasta=${hasta}`}>📄 Estado de cuenta (imprimir o Excel)</Link>
                {s.items.length > 0 && (
                  <table className="w-full">
                    <thead className="text-left text-tenue uppercase"><tr><th className="py-1">Documento</th><th>Emisión</th><th>Vence</th><th className="text-right">Cargo</th><th className="text-right">Abonos</th><th className="text-right">Saldo</th></tr></thead>
                    <tbody>
                      {s.items.map((i) => {
                        const d = diasEntre(i.vence, hasta);
                        return (
                          <tr key={i.clave} className="border-t border-borde/40">
                            <td className="py-1">{i.folio ? <span className="num">{i.tipo_dte} N° {i.folio}</span> : <span className="text-tenue">{i.descripcion}</span>}</td>
                            <td className="num">{fechaCL(i.fecha)}</td>
                            <td className={`num ${d > 0 ? 'text-aviso' : ''}`}>{fechaCL(i.vence)}{d > 0 ? ` (${d}d)` : ''}</td>
                            <td className="num text-right">{clp(i.cargo)}</td><td className="num text-right">{i.abonos ? clp(i.abonos) : ''}</td>
                            <td className="num text-right font-semibold">{clp(i.saldo)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                {s.aFavor < 0 && <p className="text-aviso">Saldo a favor sin imputar: {clp(-s.aFavor)}</p>}
                <details>
                  <summary className="cursor-pointer text-tenue">Ver los {s.movimientos.length} movimientos</summary>
                  <table className="mt-1 w-full">
                    <tbody>
                      {s.movimientos.map((m, k) => (
                        <tr key={k} className="border-t border-borde/30">
                          <td className="num w-24 py-0.5">{fechaCL(m.fecha)}</td><td className="num w-16">N° {m.numero}</td>
                          <td>{m.glosa}{m.folio ? ` · ${m.tipo_dte} N° ${m.folio}` : ''}</td>
                          <td className="num w-28 text-right">{m.monto > 0 ? clp(m.monto) : ''}</td><td className="num w-28 text-right">{m.monto < 0 ? clp(-m.monto) : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
