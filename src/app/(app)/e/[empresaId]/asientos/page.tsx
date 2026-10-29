import type { Metadata } from 'next';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { traerTodo } from '@/lib/paginar';
import { param } from '@/lib/formato';
import { anioContable } from '@/lib/anio-contable';
import type { AsientoBusqueda } from '@/lib/buscar-asientos';
import { PestanasComprobantes } from './pestanas';
import { BuscadorComprobantes } from './buscador';

export const metadata: Metadata = { title: 'Buscar comprobantes' };

const esFecha = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function ComprobantesPage({ params, searchParams }: PageProps<'/e/[empresaId]/asientos'>) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const empresa = await requerirEmpresa(empresaId);
  const anio = await anioContable();
  // Por defecto, el año contable elegido en el menú
  let desde = esFecha(param(sp.desde)) ? param(sp.desde) : `${anio}-01-01`;
  let hasta = esFecha(param(sp.hasta)) ? param(sp.hasta) : `${anio}-12-31`;
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  const supabase = await crearClienteServidor();
  const [asientos, cuentas, per] = await Promise.all([
    traerTodo((d, h) => supabase.from('asientos')
      .select('id,numero,fecha,glosa,tipo,anulado,asiento_lineas(cuenta,debe,haber,glosa,centro_costo,rut_auxiliar,folio)')
      .eq('empresa_id', empresaId).gte('fecha', desde).lte('fecha', hasta)
      .order('fecha', { ascending: false }).order('numero', { ascending: false }).range(d, h)),
    supabase.from('cuentas').select('codigo,nombre').eq('empresa_id', empresaId).limit(5000),
    supabase.from('periodos_cerrados').select('periodo').eq('empresa_id', empresaId),
  ]);
  const escribe = puedeEscribir(empresa.rol);
  return (
    <div className="max-w-[1100px] space-y-4">
      <PestanasComprobantes empresaId={empresaId} activa="buscar" escribe={escribe} />
      <BuscadorComprobantes empresaId={empresaId} desde={desde} hasta={hasta} anio={anio} escribe={escribe}
        asientos={asientos as AsientoBusqueda[]}
        cuentas={Object.fromEntries((cuentas.data ?? []).map((c) => [c.codigo as string, c.nombre as string]))}
        cerrados={(per.data ?? []).map((p) => p.periodo as string)} />
    </div>
  );
}
