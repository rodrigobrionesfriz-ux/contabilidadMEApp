import type { Metadata } from 'next';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { traerTodo } from '@/lib/paginar';
import type { Bien } from '@/activo-fijo/depreciacion';
import { param } from '@/lib/formato';
import { ActivoFijo, type FilaActivo, type CompraAF } from './activo-fijo';
import { anioContable } from '@/lib/anio-contable';

export const metadata: Metadata = { title: 'Activo fijo' };

export default async function ActivoFijoPage({ params, searchParams }: PageProps<'/e/[empresaId]/activo-fijo'>) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const anio = Number(param(sp.anio)) || await anioContable();
  const empresa = await requerirEmpresa(empresaId);
  const supabase = await crearClienteServidor();
  const [activos, docs, lineas12, dep] = await Promise.all([
    supabase.from('activos_fijos').select('id,descripcion,categoria,fecha,ficha,documento_id,estado').eq('empresa_id', empresaId).order('fecha'),
    traerTodo((d, h) => supabase.from('documentos').select('id,fecha,tipo_dte,folio,razon_social,neto,asiento_id').eq('empresa_id', empresaId).eq('tipo', 'compra').neq('estado', 'anulado').order('fecha', { ascending: false }).range(d, h)),
    traerTodo((d, h) => supabase.from('asiento_lineas').select('asiento_id,debe').eq('empresa_id', empresaId).like('cuenta', '12%').gt('debe', 0).range(d, h)),
    supabase.from('asientos').select('numero,fecha').eq('empresa_id', empresaId).eq('tipo', 'depreciacion').eq('origen_id', `dep:${anio}`).eq('anulado', false).maybeSingle(),
  ]);
  const a12 = new Map<string, number>();
  for (const l of lineas12 as { asiento_id: string; debe: number }[]) a12.set(l.asiento_id, (a12.get(l.asiento_id) || 0) + Number(l.debe));
  const compras: CompraAF[] = (docs as { id: string; fecha: string; tipo_dte: number; folio: string; razon_social: string | null; neto: number; asiento_id: string | null }[])
    .filter((d) => d.asiento_id && a12.has(d.asiento_id)).map((d) => ({ id: d.id, fecha: String(d.fecha).slice(0, 10), rotulo: `${String(d.fecha).slice(0, 10)} · DTE ${d.tipo_dte} N°${d.folio} · ${d.razon_social || ''}`, base: Math.round(a12.get(d.asiento_id!) || Number(d.neto) || 0) }));
  const filas: FilaActivo[] = (activos.data ?? []).map((a) => ({ id: a.id, descripcion: a.descripcion, categoria: a.categoria, fecha: String(a.fecha).slice(0, 10), ficha: a.ficha as Bien, documentoId: a.documento_id, estado: a.estado }));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Activo fijo y depreciación · {anio}</h1>
          <p className="text-sm text-tenue">Vida útil normal según la tabla del SII; depreciación acelerada del Art. 31 N°5 LIR (un tercio de la vida normal). La contable genera el asiento; la tributaria se usa en la renta anual.</p>
        </div>
        <form className="flex items-end gap-2">
          <div><label className="etiqueta" htmlFor="anio">Año</label><select id="anio" name="anio" defaultValue={anio} className="campo w-28">{Array.from({ length: 8 }, (_, i) => new Date().getFullYear() + 1 - i).map((y) => <option key={y} value={y}>{y}</option>)}</select></div>
          <button className="boton-sec">Ver</button>
        </form>
      </div>
      <ActivoFijo empresaId={empresaId} anio={anio} filas={filas} compras={compras} escribe={puedeEscribir(empresa.rol)} depreciacion={dep.data ? { numero: dep.data.numero } : null} />
    </div>
  );
}
