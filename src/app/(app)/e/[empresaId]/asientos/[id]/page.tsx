import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { clp, fechaCL } from '@/lib/formato';
import { BotonImprimir } from '@/components/boton-imprimir';

export const metadata: Metadata = { title: 'Comprobante contable' };

export default async function AsientoPage({ params }: PageProps<'/e/[empresaId]/asientos/[id]'>) {
  const { empresaId, id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const empresa = await requerirEmpresa(empresaId);
  const supabase = await crearClienteServidor();
  const [a, lineas, docs] = await Promise.all([
    supabase.from('asientos').select('id,numero,fecha,glosa,tipo,origen_id,anulado,anulado_en,motivo_anulacion,creado').eq('id', id).eq('empresa_id', empresaId).maybeSingle(),
    supabase.from('asiento_lineas').select('orden,cuenta,debe,haber,glosa,centro_costo,rut_auxiliar,tipo_dte,folio').eq('asiento_id', id).eq('empresa_id', empresaId).order('orden'),
    supabase.from('documentos').select('id,tipo,tipo_dte,folio,fecha,rut,razon_social,neto,exento,iva,total').eq('asiento_id', id).eq('empresa_id', empresaId),
  ]);
  if (!a.data) notFound();
  const cds = [...new Set((lineas.data ?? []).map((l) => l.cuenta))];
  const { data: cuentas } = cds.length ? await supabase.from('cuentas').select('codigo,nombre').eq('empresa_id', empresaId).in('codigo', cds) : { data: [] };
  const nombre = new Map((cuentas ?? []).map((c) => [c.codigo, c.nombre]));
  const ls = lineas.data ?? [];
  const td = ls.reduce((s, l) => s + Number(l.debe), 0), th = ls.reduce((s, l) => s + Number(l.haber), 0);
  const x = a.data;
  const { data: cerrado } = await supabase.from('periodos_cerrados').select('periodo').eq('empresa_id', empresaId).eq('periodo', String(x.fecha).slice(0, 7)).maybeSingle();
  const editable = puedeEscribir(empresa.rol) && !x.anulado && x.tipo !== 'cierre' && !cerrado;
  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Link href={`/e/${empresaId}/diario?anio=${String(x.fecha).slice(0, 4)}&mes=${Number(String(x.fecha).slice(5, 7))}`} className="boton-sec">← Libro diario</Link>
          {x.tipo === 'pago' && <Link href={`/e/${empresaId}/pagos?tipo=historial`} className="boton-sec">📜 Historial de pagos</Link>}
        </div>
        <div className="flex gap-2">
          {editable && (x.tipo === 'apertura'
            ? <Link href={`/e/${empresaId}/apertura?anio=${String(x.fecha).slice(0, 4)}`} className="boton-sec">✏️ Editar apertura</Link>
            : <Link href={`/e/${empresaId}/asientos/${x.id}/editar`} className="boton">✏️ Editar</Link>)}
          {!editable && cerrado && !x.anulado && <span className="self-center text-xs text-tenue">Período {String(x.fecha).slice(0, 7)} cerrado: no se puede editar</span>}
          <BotonImprimir />
        </div>
      </div>
      <article className="hoja tarjeta mx-auto max-w-4xl space-y-4 p-8 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><div className="font-bold">{empresa.razon_social}</div><div className="text-xs text-tenue">RUT {empresa.rut}</div></div>
          <div className="text-right"><div className="text-lg font-semibold">Comprobante N° {x.numero}</div><div className="text-xs text-tenue">{fechaCL(String(x.fecha).slice(0, 10))} · {x.tipo}{x.origen_id ? ` · ${x.origen_id}` : ''}</div></div>
        </div>
        {x.anulado && <p className="rounded-md border border-peligro/40 bg-peligro/10 p-2 text-peligro"><strong>ANULADO</strong>{x.anulado_en ? ` el ${fechaCL(String(x.anulado_en).slice(0, 10))}` : ''}{x.motivo_anulacion ? `: ${x.motivo_anulacion}` : ''}</p>}
        <p><span className="text-tenue">Glosa:</span> {x.glosa}</p>
        <table className="w-full text-xs">
          <thead className="text-left text-tenue"><tr className="border-b border-borde"><th className="py-1">Cuenta</th><th>Detalle</th><th className="w-[15ch] pl-4 text-right">Debe</th><th className="w-[15ch] pl-4 text-right">Haber</th></tr></thead>
          <tbody>{ls.map((l) => (
            <tr key={l.orden} className="border-b border-borde/30 align-top">
              <td className="py-1"><span className="num">{l.cuenta}</span> {nombre.get(l.cuenta)}</td>
              <td className="text-tenue">{[l.glosa, l.centro_costo && `CC ${l.centro_costo}`, l.rut_auxiliar && `RUT ${l.rut_auxiliar}`, l.folio && `DTE ${l.tipo_dte} N° ${l.folio}`].filter(Boolean).join(' · ')}</td>
              <td className="num pl-4 text-right whitespace-nowrap">{Number(l.debe) ? clp(l.debe) : ''}</td><td className="num pl-4 text-right whitespace-nowrap">{Number(l.haber) ? clp(l.haber) : ''}</td>
            </tr>
          ))}</tbody>
          <tfoot><tr className="font-semibold"><td colSpan={2} className="py-1">Totales</td><td className="num pl-4 text-right whitespace-nowrap">{clp(td)}</td><td className="num pl-4 text-right whitespace-nowrap">{clp(th)}</td></tr></tfoot>
        </table>
        {(docs.data ?? []).length > 0 && (
          <div className="rounded-md border border-borde p-3 text-xs">
            <div className="mb-1 font-semibold">Documento que lo origina</div>
            {(docs.data ?? []).map((d) => <div key={d.id}>{d.tipo} · DTE {d.tipo_dte} N° {d.folio} · {d.razon_social} {d.rut} · {fechaCL(String(d.fecha).slice(0, 10))} · neto {clp(d.neto)} · IVA {clp(d.iva)} · total {clp(d.total)}</div>)}
          </div>
        )}
        <div className="grid grid-cols-3 gap-8 pt-12 text-center text-xs text-tenue"><div className="border-t border-borde pt-1">Preparado por</div><div className="border-t border-borde pt-1">Revisado por</div><div className="border-t border-borde pt-1">Aprobado por</div></div>
      </article>
    </div>
  );
}
