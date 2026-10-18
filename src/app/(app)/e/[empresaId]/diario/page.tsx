import type { Metadata } from 'next';
import Link from 'next/link';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { clp, fechaCL } from '@/lib/formato';
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
  const anio = Number(Array.isArray(sp.anio) ? sp.anio[0] : sp.anio) || new Date().getFullYear();
  const empresa = await requerirEmpresa(empresaId);
  const supabase = await crearClienteServidor();
  const [{ data, error }, cuentas] = await Promise.all([
    supabase.from('asientos')
      .select('id,numero,fecha,glosa,tipo,anulado,motivo_anulacion,asiento_lineas(orden,cuenta,debe,haber,glosa,centro_costo,rut_auxiliar)')
      .eq('empresa_id', empresaId).eq('anio', anio)
      .order('fecha').order('numero').order('orden', { referencedTable: 'asiento_lineas' }),
    supabase.from('cuentas').select('codigo,nombre').eq('empresa_id', empresaId),
  ]);
  if (error) throw new Error(error.message);
  const nombre = new Map((cuentas.data ?? []).map((c) => [c.codigo, c.nombre]));
  const asientos = data as AsientoDB[];
  const vigentes = asientos.filter((a) => !a.anulado);
  const total = vigentes.flatMap((a) => a.asiento_lineas).reduce((s, l) => s + Number(l.debe), 0);
  const escribe = puedeEscribir(empresa.rol);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Libro diario {anio}</h1>
        <div className="flex items-center gap-2 text-sm">
          <Link href={`?anio=${anio - 1}`} className="boton-sec">← {anio - 1}</Link>
          <Link href={`?anio=${anio + 1}`} className="boton-sec">{anio + 1} →</Link>
        </div>
      </div>
      <p className="text-sm text-tenue">{vigentes.length} asientos vigentes · total debe/haber <span className="num text-texto">{clp(total)}</span></p>
      {asientos.length === 0 && <div className="tarjeta p-8 text-center text-tenue">Sin asientos en {anio}.</div>}
      {asientos.map((a) => (
        <section key={a.id} className={`tarjeta ${a.anulado ? 'opacity-50' : ''}`}>
          <header className="flex flex-wrap items-center gap-3 border-b border-borde px-4 py-2 text-sm">
            <span className="num font-semibold">N° {a.numero}</span>
            <span className="num text-tenue">{fechaCL(a.fecha)}</span>
            <span className="min-w-0 flex-1 truncate">{a.glosa}</span>
            {a.anulado && <span className="rounded bg-peligro/20 px-2 py-0.5 text-xs font-semibold text-peligro" title={a.motivo_anulacion ?? ''}>ANULADO</span>}
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
                  <td className="num w-36 px-2 py-1 text-right">{Number(l.debe) ? clp(l.debe) : ''}</td>
                  <td className="num w-36 px-4 py-1 text-right">{Number(l.haber) ? clp(l.haber) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
