import type { Metadata } from 'next';
import { requerirEmpresa } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { traerTodo } from '@/lib/paginar';
import { MESES, param } from '@/lib/formato';
import { dteC, dteV } from '@/motor/dte';
import { resumenIECV, type DocIECV, type TipoOperacion } from '@/herramientas/iecv';
import { clp } from '@/lib/formato';
import { DescargarIECV } from './descargar';

export const metadata: Metadata = { title: 'XML IECV' };

export default async function IECVPage({ params, searchParams }: PageProps<'/e/[empresaId]/iecv'>) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const hoy = new Date();
  const anio = Number(param(sp.anio)) || hoy.getFullYear();
  const mes = Number(param(sp.mes)) || hoy.getMonth() + 1;
  const tipo: TipoOperacion = param(sp.tipo) === 'COMPRA' ? 'COMPRA' : 'VENTA';
  const empresa = await requerirEmpresa(empresaId);
  const supabase = await crearClienteServidor();
  const periodo = `${anio}-${String(mes).padStart(2, '0')}`;
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const filas = await traerTodo((d, h) => {
    let q = supabase.from('documentos').select('tipo_dte,folio,fecha,rut,razon_social,neto,exento,iva,total,estado').eq('empresa_id', empresaId).eq('tipo', tipo === 'VENTA' ? 'venta' : 'compra');
    q = tipo === 'VENTA' ? q.gte('fecha', `${periodo}-01`).lte('fecha', `${periodo}-${ultimo}`) : q.eq('periodo', periodo);
    return q.order('fecha').order('folio').range(d, h);
  });
  const docs: DocIECV[] = (filas as Record<string, unknown>[]).filter((d) => d.estado !== 'anulado')
    .map((d) => ({ tipoDTE: Number(d.tipo_dte), folio: String(d.folio || ''), fecha: d.fecha ? String(d.fecha).slice(0, 10) : null, rut: (d.rut as string) || null, razonSocial: (d.razon_social as string) || '', neto: Number(d.neto), exento: Number(d.exento), iva: Number(d.iva), total: Number(d.total) }));
  const { resumen, total } = resumenIECV(tipo, docs);
  const nombreDte = (c: string) => (tipo === 'VENTA' ? dteV(c) : dteC(c))?.nm || `DTE ${c}`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">XML de compras y ventas (IECV)</h1>
          <p className="max-w-3xl text-sm text-tenue">Genera el XML del libro de {tipo === 'VENTA' ? 'ventas' : 'compras'} con el esquema LibroCV_v10 del SII. Las ventas se toman por fecha y las compras por período del libro; se excluyen los documentos anulados.</p>
        </div>
        <form className="flex items-end gap-2">
          <div><label className="etiqueta" htmlFor="tipo">Libro</label><select id="tipo" name="tipo" defaultValue={tipo} className="campo w-32"><option value="VENTA">Ventas</option><option value="COMPRA">Compras</option></select></div>
          <div><label className="etiqueta" htmlFor="mes">Mes</label><select id="mes" name="mes" defaultValue={mes} className="campo w-36">{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>
          <div><label className="etiqueta" htmlFor="anio">Año</label><select id="anio" name="anio" defaultValue={anio} className="campo w-28">{Array.from({ length: 6 }, (_, i) => hoy.getFullYear() - i).map((y) => <option key={y}>{y}</option>)}</select></div>
          <button className="boton-sec">Ver</button>
        </form>
      </div>
      {docs.length ? <>
        <div className="grid gap-3 sm:grid-cols-4">
          {([['Documentos', String(total.docs)], ['Neto', clp(total.neto)], ['IVA', clp(total.iva)], ['Total', clp(total.total)]] as [string, string][]).map(([k, v]) => <div key={k} className="tarjeta p-3"><div className="text-[10px] text-tenue uppercase">{k}</div><div className="num text-lg font-semibold">{v}</div></div>)}
        </div>
        <div className="tarjeta overflow-x-auto p-3"><table className="w-full text-sm">
          <thead className="text-left text-xs text-tenue"><tr className="border-b border-borde"><th className="py-1">Tipo de documento</th><th className="text-right">N°</th><th className="text-right">Exento</th><th className="text-right">Neto</th><th className="text-right">IVA</th><th className="text-right">Total</th></tr></thead>
          <tbody>{Object.entries(resumen).map(([c, r]) => <tr key={c} className="border-b border-borde/30"><td className="py-1">{c} · {nombreDte(c)}</td><td className="num text-right">{r.docs}</td><td className="num text-right">{clp(r.exe)}</td><td className="num text-right">{clp(r.neto)}</td><td className="num text-right">{clp(r.iva)}</td><td className="num text-right">{clp(r.total)}</td></tr>)}</tbody>
        </table></div>
        <DescargarIECV empresaId={empresaId} tipo={tipo} periodo={periodo} rut={empresa.rut} docs={docs} />
        <p className="text-xs text-tenue">El archivo cumple el formato de datos, pero para presentarlo al SII debe firmarse digitalmente con tu certificado. Sirve para revisión o para cargarlo en un software que agregue la firma.</p>
      </> : <p className="tarjeta p-6 text-center text-tenue">📭 No hay documentos de {tipo === 'VENTA' ? 'venta' : 'compra'} en {MESES[mes - 1]} {anio}.</p>}
    </div>
  );
}
