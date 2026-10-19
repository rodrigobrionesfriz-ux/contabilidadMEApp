import Link from 'next/link';
import type { Metadata } from 'next';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { clp, fechaCL, param, rangoAnio, MESES } from '@/lib/formato';
import { traerTodo } from '@/lib/paginar';
import { SelectorPeriodo } from '@/components/selector-periodo';
import { BotonAnular } from './anular';

export const metadata: Metadata = { title: 'Libro diario' };

interface LineaDB { orden: number; cuenta: string; debe: number; haber: number; glosa: string | null; centro_costo: string | null; rut_auxiliar: string | null }
interface AsientoDB {
  id: string; numero: number; fecha: string; glosa: string; tipo: string; anulado: boolean; motivo_anulacion: string | null;
  asiento_lineas: LineaDB[];
}

export default async function DiarioPage({ params, searchParams }: PageProps<'/e/[empresaId]/diario'>) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const anio = Number(param(sp.anio)) || new Date().getFullYear();
  const mes = Number(param(sp.mes)) || 0;
  const { desde, hasta } = mes ? rangoAnio(anio, mes, mes) : rangoAnio(anio);
  const empresa = await requerirEmpresa(empresaId);
  const supabase = await crearClienteServidor();
  const [data, cuentas, per] = await Promise.all([
    traerTodo((d, h) => supabase.from('asientos')
      .select('id,numero,fecha,glosa,tipo,anulado,motivo_anulacion,asiento_lineas(orden,cuenta,debe,haber,glosa,centro_costo,rut_auxiliar)')
      .eq('empresa_id', empresaId).eq('anio', anio).gte('fecha', desde).lte('fecha', hasta)
      .order('fecha').order('numero').order('orden', { referencedTable: 'asiento_lineas' }).range(d, h)),
    supabase.from('cuentas').select('codigo,nombre').eq('empresa_id', empresaId).limit(5000),
    supabase.from('periodos_cerrados').select('periodo').eq('empresa_id', empresaId).like('periodo', `${anio}-%`),
  ]);
  const cerrados = new Set((per.data ?? []).map((p) => p.periodo as string));
  const nombre = new Map((cuentas.data ?? []).map((c) => [c.codigo, c.nombre]));
  const asientos = data as AsientoDB[];
  const vigentes = asientos.filter((a) => !a.anulado);
  const total = vigentes.flatMap((a) => a.asiento_lineas).reduce((s, l) => s + Number(l.debe), 0);
  const escribe = puedeEscribir(empresa.rol);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Libro diario {mes ? `${MESES[mes - 1]} ` : ''}{anio}</h1>
        <SelectorPeriodo anio={anio} mes={mes} etiquetaMes="Mes" />
      </div>
      <p className="text-sm text-tenue">{vigentes.length} asientos vigentes · total debe/haber <span className="num text-texto">{clp(total)}</span></p>
      {asientos.length === 0 && <div className="tarjeta p-8 text-center text-tenue">Sin asientos en el período.</div>}
      {asientos.map((a) => (
        <section key={a.id} id={`n${a.numero}`} className={`tarjeta scroll-mt-4 ${a.anulado ? 'opacity-50' : ''}`}>
          <header className="flex flex-wrap items-center gap-3 border-b border-borde px-4 py-2 text-sm">
            <Link href={`/e/${empresaId}/asientos/${a.id}`} className="num font-semibold hover:text-acento" title="Ver comprobante">N° {a.numero}</Link>
            <span className="num text-tenue">{fechaCL(a.fecha)}</span>
            <span className="min-w-0 flex-1 truncate">{a.glosa}</span>
            {a.anulado && <span className="rounded bg-peligro/20 px-2 py-0.5 text-xs font-semibold text-peligro" title={a.motivo_anulacion ?? ''}>ANULADO</span>}
            {!a.anulado && escribe && a.tipo !== 'cierre' && !cerrados.has(a.fecha.slice(0, 7)) && (
              <Link href={a.tipo === 'apertura' ? `/e/${empresaId}/apertura?anio=${a.fecha.slice(0, 4)}` : `/e/${empresaId}/asientos/${a.id}/editar`}
                className="text-xs text-tenue hover:text-acento" title={`Editar el comprobante N° ${a.numero}`}>✏️ Editar</Link>
            )}
            {!a.anulado && escribe && <BotonAnular empresaId={empresaId} id={a.id} numero={a.numero} />}
          </header>
          <table className="w-full text-sm">
            <tbody>
              {a.asiento_lineas.map((l) => (
                <tr key={l.orden} className="border-b border-borde/40 last:border-0">
                  <td className="num w-24 px-4 py-1">{l.cuenta}</td>
                  <td className={`px-2 py-1 ${Number(l.haber) > 0 ? 'pl-8' : ''}`}>
                    {nombre.get(l.cuenta) ?? l.cuenta}
                    <span className="ml-2 text-xs text-tenue">
                      {[l.rut_auxiliar, l.centro_costo && `CC ${l.centro_costo}`, l.glosa].filter(Boolean).join(' · ')}
                    </span>
                  </td>
                  <td className="num w-[16ch] px-2 py-1 text-right whitespace-nowrap">{Number(l.debe) ? clp(l.debe) : ''}</td>
                  <td className="num w-[16ch] px-4 py-1 text-right whitespace-nowrap">{Number(l.haber) ? clp(l.haber) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
