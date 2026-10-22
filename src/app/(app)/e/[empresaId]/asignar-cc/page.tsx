import type { Metadata } from 'next';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { traerTodo } from '@/lib/paginar';
import { param } from '@/lib/formato';
import { AsignarCC, type LineaCC } from './asignar';
import { anioContable } from '@/lib/anio-contable';

export const metadata: Metadata = { title: 'Asignar centros de costo' };

export default async function AsignarCCPage({ params, searchParams }: PageProps<'/e/[empresaId]/asignar-cc'>) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const anio = Number(param(sp.anio)) || await anioContable();
  const empresa = await requerirEmpresa(empresaId);
  const supabase = await crearClienteServidor();
  const [lineas, centros, cuentas] = await Promise.all([
    traerTodo((d, h) => supabase.rpc('lineas_costeables', { p_empresa: empresaId, p_desde: `${anio}-01-01`, p_hasta: `${anio}-12-31` }).range(d, h)),
    supabase.from('centros_costo').select('codigo,nombre,nivel,padre').eq('empresa_id', empresaId).eq('activo', true).order('codigo'),
    supabase.from('cuentas').select('codigo,nombre').eq('empresa_id', empresaId).like('codigo', '3%'),
  ]);
  const nombre = new Map((cuentas.data ?? []).map((c) => [c.codigo, c.nombre]));
  const filas: LineaCC[] = (lineas as Record<string, unknown>[]).map((l) => ({
    id: Number(l.id), asientoId: String(l.asiento_id), cuenta: String(l.cuenta), nombreCuenta: nombre.get(String(l.cuenta)) || '', fecha: String(l.fecha).slice(0, 10), numero: Number(l.numero),
    tipo: String(l.tipo), glosa: [l.glosa, l.glosa_linea].filter(Boolean).join(' · '), monto: Number(l.debe) - Number(l.haber), cc: (l.centro_costo as string) || '',
    doc: l.folio ? `DTE ${l.tipo_dte} N° ${l.folio}${l.rut ? ` · ${l.rut}` : ''}` : '',
  }));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Asignar centros de costo · {anio}</h1>
          <p className="max-w-3xl text-sm text-tenue">Un gasto sin centro no aparece en el costo del predio o cuartel. Aquí se repasan los movimientos de cuentas de costo y gasto (grupos 31 a 35) que admiten centro de costo, se asignan uno a uno o en bloque. Sólo cambia el centro: no los montos ni las cuentas, por eso también se permite en meses cerrados (queda en el registro de actividad).</p>
        </div>
        <form className="flex items-end gap-2">
          <div><label className="etiqueta" htmlFor="anio">Año</label><select id="anio" name="anio" defaultValue={anio} className="campo w-28">{Array.from({ length: 8 }, (_, i) => new Date().getFullYear() - i).map((y) => <option key={y} value={y}>{y}</option>)}</select></div>
          <button className="boton-sec">Ver</button>
        </form>
      </div>
      <AsignarCC empresaId={empresaId} filas={filas} centros={centros.data ?? []} escribe={puedeEscribir(empresa.rol)} />
    </div>
  );
}
