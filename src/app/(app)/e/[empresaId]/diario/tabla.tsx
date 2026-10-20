import Link from 'next/link';
import { crearClienteServidor } from '@/lib/supabase/server';
import { clp, fechaCL, rangoAnio } from '@/lib/formato';
import { traerTodo } from '@/lib/paginar';
import { BotonAnular } from './anular';
import { LinkPrincipal } from './flotante';

interface LineaDB { orden: number; cuenta: string; debe: number; haber: number; glosa: string | null; centro_costo: string | null; rut_auxiliar: string | null }
export interface AsientoDB {
  id: string; numero: number; fecha: string; glosa: string; tipo: string; anulado: boolean; motivo_anulacion: string | null;
  asiento_lineas: LineaDB[];
}

/** Asientos del período con el nombre de cada cuenta y los meses cerrados. */
export async function cargarDiario(empresaId: string, anio: number, mes: number) {
  const { desde, hasta } = mes ? rangoAnio(anio, mes, mes) : rangoAnio(anio);
  const supabase = await crearClienteServidor();
  const [data, cuentas, per] = await Promise.all([
    traerTodo((d, h) => supabase.from('asientos')
      .select('id,numero,fecha,glosa,tipo,anulado,motivo_anulacion,asiento_lineas(orden,cuenta,debe,haber,glosa,centro_costo,rut_auxiliar)')
      .eq('empresa_id', empresaId).eq('anio', anio).gte('fecha', desde).lte('fecha', hasta)
      .order('fecha').order('numero').order('orden', { referencedTable: 'asiento_lineas' }).range(d, h)),
    supabase.from('cuentas').select('codigo,nombre').eq('empresa_id', empresaId).limit(5000),
    supabase.from('periodos_cerrados').select('periodo').eq('empresa_id', empresaId).like('periodo', `${anio}-%`),
  ]);
  const asientos = data as AsientoDB[];
  const vigentes = asientos.filter((a) => !a.anulado);
  return {
    asientos, vigentes: vigentes.length,
    total: vigentes.flatMap((a) => a.asiento_lineas).reduce((s, l) => s + Number(l.debe), 0),
    nombre: new Map((cuentas.data ?? []).map((c) => [c.codigo as string, c.nombre as string])),
    cerrados: new Set((per.data ?? []).map((p) => p.periodo as string)),
  };
}

/**
 * Libro diario compacto: una sola tabla de ancho acotado, con una franja por asiento (N°, fecha, glosa, acciones)
 * y sus líneas debajo. En la ventana flotante los enlaces abren en la ventana principal.
 */
export function TablaDiario({ empresaId, datos, escribe, flotante = false }: {
  empresaId: string; datos: Awaited<ReturnType<typeof cargarDiario>>; escribe: boolean; flotante?: boolean;
}) {
  const { asientos, nombre, cerrados } = datos;
  const Enlace = flotante ? LinkPrincipal : Link;
  if (!asientos.length) return <div className="tarjeta p-8 text-center text-tenue">Sin asientos en el período.</div>;
  return (
    // La tarjeta es la que se desplaza (así los títulos de la tabla quedan fijos arriba).
    <div className={`tarjeta overflow-auto ${flotante ? 'h-full' : 'max-h-[calc(100dvh-12rem)]'}`}>
      <table className="w-full min-w-[640px] table-fixed text-[13px]">
        <colgroup><col className="w-[76px]" /><col className="w-[34%]" /><col /><col className="w-[112px]" /><col className="w-[112px]" /></colgroup>
        <thead className="sticky top-0 z-10 bg-panel text-left text-[10px] text-tenue uppercase shadow-[0_1px_0_var(--borde)]">
          <tr><th className="px-2 py-1.5">Cuenta</th><th className="px-2 py-1.5">Nombre</th><th className="px-2 py-1.5">Detalle</th><th className="px-2 py-1.5 text-right">Debe</th><th className="px-2 py-1.5 text-right">Haber</th></tr>
        </thead>
        {asientos.map((a) => {
          const editable = !a.anulado && escribe && a.tipo !== 'cierre' && !cerrados.has(a.fecha.slice(0, 7));
          return (
            <tbody key={a.id} id={`n${a.numero}`} className={`scroll-mt-10 ${a.anulado ? 'opacity-50' : ''}`}>
              <tr className="border-t-2 border-borde bg-panel-2/60">
                <td colSpan={5} className="px-2 py-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Enlace href={`/e/${empresaId}/asientos/${a.id}`} className="num font-semibold hover:text-acento" title="Ver comprobante">N° {a.numero}</Enlace>
                    <span className="num text-tenue">{fechaCL(a.fecha)}</span>
                    <span className="min-w-0 flex-1 truncate font-medium" title={a.glosa}>{a.glosa}</span>
                    {a.anulado && <span className="rounded bg-peligro/20 px-1.5 text-[10px] font-semibold text-peligro" title={a.motivo_anulacion ?? ''}>ANULADO</span>}
                    {editable && (
                      <Enlace href={a.tipo === 'apertura' ? `/e/${empresaId}/apertura?anio=${a.fecha.slice(0, 4)}` : `/e/${empresaId}/asientos/${a.id}/editar`}
                        className="text-xs text-tenue hover:text-acento" title={`Editar el comprobante N° ${a.numero}`}>✏️ Editar</Enlace>
                    )}
                    {!a.anulado && escribe && !flotante && <BotonAnular empresaId={empresaId} id={a.id} numero={a.numero} />}
                  </div>
                </td>
              </tr>
              {a.asiento_lineas.map((l) => {
                const det = [l.rut_auxiliar, l.centro_costo && `CC ${l.centro_costo}`, l.glosa].filter(Boolean).join(' · ');
                return (
                  <tr key={l.orden} className="border-t border-borde/30 hover:bg-panel-2/40">
                    <td className="num px-2 py-0.5">{l.cuenta}</td>
                    <td className={`truncate py-0.5 pr-2 ${Number(l.haber) > 0 ? 'pl-6' : 'pl-2'}`} title={nombre.get(l.cuenta) ?? l.cuenta}>{nombre.get(l.cuenta) ?? l.cuenta}</td>
                    <td className="truncate px-2 py-0.5 text-xs text-tenue" title={det}>{det}</td>
                    <td className="num px-2 py-0.5 text-right whitespace-nowrap">{Number(l.debe) ? clp(l.debe) : ''}</td>
                    <td className="num px-2 py-0.5 text-right whitespace-nowrap">{Number(l.haber) ? clp(l.haber) : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
