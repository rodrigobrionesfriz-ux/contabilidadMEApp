import type { Metadata } from 'next';
import Link from 'next/link';
import { requerirEmpresa } from '@/lib/auth';
import { saldosAuxiliar } from '@/lib/datos/auxiliares';
import { diasEntre, type TipoAuxiliar } from '@/auxiliares/saldos';
import { clp, fechaCL, hoyISO, param } from '@/lib/formato';
import { BotonImprimir } from '@/components/boton-imprimir';
import { ExcelEstado } from './excel';

export const metadata: Metadata = { title: 'Estado de cuenta' };

export default async function EstadoCuentaPage({ params, searchParams }: PageProps<'/e/[empresaId]/auxiliares/estado'>) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const t = param(sp.tipo);
  const tipo: TipoAuxiliar = t === 'cliente' || t === 'honorario' ? t : 'proveedor';
  const rut = param(sp.rut);
  const hoy = hoyISO();
  const hasta = /^\d{4}-\d{2}-\d{2}$/.test(param(sp.hasta)) ? param(sp.hasta) : hoy;
  const vista = param(sp.vista) === 'todos' ? 'todos' : 'saldo';
  const empresa = await requerirEmpresa(empresaId);
  const s = (await saldosAuxiliar(empresaId, tipo, hasta, hasta)).find((x) => x.rut === rut);
  const volver = `/e/${empresaId}/auxiliares?tipo=${tipo}&hasta=${hasta}`;
  if (!s) return <div className="space-y-3"><Link href={volver} className="boton-sec">← Auxiliares</Link><p className="tarjeta p-6 text-center text-tenue">Este auxiliar no tiene movimientos en el ejercicio {hasta.slice(0, 4)}.</p></div>;
  const esCliente = tipo === 'cliente';
  const cartola = s.movimientos.reduce<((typeof s.movimientos)[number] & { saldo: number })[]>((acc, m) => [...acc, { ...m, saldo: (acc.at(-1)?.saldo ?? 0) + m.monto }], []);
  const q = (c: Record<string, string>) => '?' + new URLSearchParams({ tipo, rut, hasta, vista, ...c }).toString();
  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-end justify-between gap-2">
        <Link href={volver} className="boton-sec">← Auxiliares</Link>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex gap-1 rounded-md border border-borde p-1 text-sm">
            <Link href={q({ vista: 'saldo' })} className={`rounded px-3 py-1 ${vista === 'saldo' ? 'bg-panel-2 text-acento' : 'text-tenue'}`}>Sólo con saldo</Link>
            <Link href={q({ vista: 'todos' })} className={`rounded px-3 py-1 ${vista === 'todos' ? 'bg-panel-2 text-acento' : 'text-tenue'}`}>Todos los movimientos</Link>
          </div>
          <form className="flex items-end gap-2">
            {Object.entries({ tipo, rut, vista }).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            <div><label className="etiqueta" htmlFor="hasta">Al</label><input id="hasta" name="hasta" type="date" defaultValue={hasta} className="campo w-40" /></div>
            <button className="boton-sec">Ver</button>
          </form>
          <ExcelEstado nombre={`estado_cuenta_${rut.replace(/[^0-9kK]/g, '')}_${hasta}.xlsx`} empresa={empresa.razon_social} aux={`${s.razon} · ${s.rut}`} hasta={hasta}
            items={s.items.map((i) => [i.tipo_dte ? `${i.tipo_dte} N° ${i.folio}` : i.descripcion, i.fecha, i.vence, i.cargo, i.abonos, i.saldo])}
            cartola={cartola.map((m) => [m.fecha, m.numero, `${m.glosa || ''}${m.folio ? ` · ${m.tipo_dte} N° ${m.folio}` : ''}`, m.monto > 0 ? m.monto : 0, m.monto < 0 ? -m.monto : 0, m.saldo])} />
          <BotonImprimir />
        </div>
      </div>
      <article className="hoja tarjeta mx-auto max-w-4xl space-y-4 p-8 text-sm">
        <div className="flex flex-wrap justify-between gap-3">
          <div><div className="font-bold">{empresa.razon_social}</div><div className="text-xs text-tenue">RUT {empresa.rut}{empresa.giro ? ` · ${empresa.giro}` : ''}</div></div>
          <div className="text-right"><div className="font-semibold">Estado de cuenta</div><div className="text-xs text-tenue">al {fechaCL(hasta)} · emitido {fechaCL(hoy)}</div></div>
        </div>
        <div className="rounded-md border border-borde p-3">
          <div className="text-xs text-tenue uppercase">{esCliente ? 'Cliente' : tipo === 'honorario' ? 'Prestador de servicios' : 'Proveedor'}</div>
          <div className="font-semibold">{s.razon || 'Sin nombre'} <span className="num font-normal text-tenue">{s.rut}</span></div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div><div className="text-[10px] text-tenue uppercase">Documentos con saldo</div><div className="num text-lg font-semibold">{s.items.length}</div></div>
          <div><div className="text-[10px] text-tenue uppercase">Vencido</div><div className="num text-lg font-semibold text-amber-500">{clp(s.items.filter((i) => diasEntre(i.vence, hasta) > 0).reduce((x, i) => x + i.saldo, 0))}</div></div>
          <div><div className="text-[10px] text-tenue uppercase">{esCliente ? 'Saldo por cobrar' : 'Saldo por pagar'}</div><div className="num text-lg font-bold">{clp(s.saldo)}</div></div>
        </div>
        <section>
          <h2 className="mb-1 text-xs font-semibold tracking-wide text-tenue uppercase">Documentos pendientes</h2>
          <table className="w-full text-xs">
            <thead className="text-left text-tenue"><tr className="border-b border-borde"><th className="py-1">Documento</th><th>Emisión</th><th>Vence</th><th className="text-right">Cargo</th><th className="text-right">Abonos</th><th className="text-right">Saldo</th></tr></thead>
            <tbody>{s.items.length ? s.items.map((i) => { const d = diasEntre(i.vence, hasta); return (
              <tr key={i.clave} className="border-b border-borde/30"><td className="py-1">{i.folio ? <span className="num">{i.tipo_dte} N° {i.folio}</span> : i.descripcion}</td><td className="num">{fechaCL(i.fecha)}</td>
                <td className={`num ${d > 0 ? 'text-amber-500' : ''}`}>{fechaCL(i.vence)}{d > 0 ? ` (${d} d)` : ''}</td><td className="num text-right">{clp(i.cargo)}</td><td className="num text-right">{i.abonos ? clp(i.abonos) : ''}</td><td className="num text-right font-semibold">{clp(i.saldo)}</td></tr>); })
              : <tr><td colSpan={6} className="py-4 text-center text-tenue">No quedan documentos con saldo pendiente.</td></tr>}</tbody>
            <tfoot><tr className="font-semibold"><td colSpan={5} className="py-1">Total</td><td className="num text-right">{clp(s.items.reduce((x, i) => x + i.saldo, 0))}</td></tr></tfoot>
          </table>
          {s.aFavor < 0 && <p className="mt-1 text-xs text-amber-500">Saldo a favor sin imputar: {clp(-s.aFavor)}</p>}
        </section>
        {vista === 'todos' && (
          <section>
            <h2 className="mb-1 text-xs font-semibold tracking-wide text-tenue uppercase">Movimientos del ejercicio</h2>
            <table className="w-full text-xs">
              <thead className="text-left text-tenue"><tr className="border-b border-borde"><th className="py-1">Fecha</th><th>Comp.</th><th>Detalle</th><th className="text-right">Cargos</th><th className="text-right">Abonos</th><th className="text-right">Saldo</th></tr></thead>
              <tbody>{cartola.map((m, k) => (
                <tr key={k} className="border-b border-borde/30"><td className="num py-0.5">{fechaCL(m.fecha)}</td><td className="num">N° {m.numero}</td><td>{m.glosa}{m.folio ? ` · ${m.tipo_dte} N° ${m.folio}` : ''}</td>
                  <td className="num text-right">{m.monto > 0 ? clp(m.monto) : ''}</td><td className="num text-right">{m.monto < 0 ? clp(-m.monto) : ''}</td><td className="num text-right">{clp(m.saldo)}</td></tr>
              ))}</tbody>
            </table>
          </section>
        )}
        <p className="text-[10px] text-tenue">Las notas de crédito con referencia se aplican a su factura; los pagos sin documento se imputan a lo más antiguo. Saldos del ejercicio {hasta.slice(0, 4)}, incluida la apertura.</p>
      </article>
    </div>
  );
}
