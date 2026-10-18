import type { Metadata } from 'next';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { traerTodo } from '@/lib/paginar';
import { cuentasDeTesoreria } from '@/lib/datos/auxiliares';
import { param } from '@/lib/formato';
import { Conciliacion } from './conciliacion';

export const metadata: Metadata = { title: 'Conciliación bancaria' };

export default async function ConciliacionPage({ params, searchParams }: PageProps<'/e/[empresaId]/conciliacion'>) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const anio = Number(param(sp.anio)) || new Date().getFullYear();
  const empresa = await requerirEmpresa(empresaId);
  const cuentas = await cuentasDeTesoreria(empresaId);
  const cuenta = param(sp.cuenta) || cuentas.find((c) => c.codigo === '1101201')?.codigo || cuentas[0]?.codigo || '';
  const supabase = await crearClienteServidor();
  const movs = cuenta ? (await traerTodo((d, h) => supabase.rpc('lineas_cuentas', { p_empresa: empresaId, p_prefijo: cuenta, p_desde: `${anio}-01-01`, p_hasta: `${anio}-12-31` }).range(d, h)) as
    { id: number; cuenta: string; fecha: string; numero: number; glosa: string; glosa_linea: string | null; debe: number; haber: number }[]).filter((m) => m.cuenta === cuenta) : [];
  const ids = movs.map((m) => m.id);
  const marcas = ids.length ? await traerTodo((d, h) => supabase.from('conciliacion_marcas').select('linea_id').eq('empresa_id', empresaId).in('linea_id', ids).range(d, h)) as { linea_id: number }[] : [];
  const { data: saldo } = await supabase.from('conciliacion_saldos').select('saldo_banco').eq('empresa_id', empresaId).eq('cuenta', cuenta).eq('anio', anio).maybeSingle();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Conciliación bancaria · {anio}</h1>
          <p className="text-sm text-tenue">Marca los movimientos del mayor que aparecen en la cartola del banco. Al coincidir el saldo según libros con el del banco, la cuenta queda conciliada.</p>
        </div>
        <form className="flex items-end gap-2">
          <div><label className="etiqueta" htmlFor="cuenta">Cuenta</label><select id="cuenta" name="cuenta" defaultValue={cuenta} className="campo w-72">{cuentas.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.nombre}</option>)}</select></div>
          <div><label className="etiqueta" htmlFor="anio">Año</label><select id="anio" name="anio" defaultValue={anio} className="campo w-28">{Array.from({ length: 8 }, (_, i) => new Date().getFullYear() + 1 - i).map((y) => <option key={y} value={y}>{y}</option>)}</select></div>
          <button className="boton-sec">Ver</button>
        </form>
      </div>
      {!cuenta ? <p className="tarjeta p-6 text-tenue">No hay cuentas de caja o banco (1101xxx) en el plan de cuentas.</p> : (
        <Conciliacion key={`${cuenta}-${anio}`} empresaId={empresaId} cuenta={cuenta} anio={anio} escribe={puedeEscribir(empresa.rol)} saldoBanco={Number(saldo?.saldo_banco ?? 0)}
          movs={movs.map((m) => ({ id: Number(m.id), fecha: String(m.fecha).slice(0, 10), glosa: m.glosa_linea ? `${m.glosa} · ${m.glosa_linea}` : m.glosa, numero: m.numero, debe: Number(m.debe), haber: Number(m.haber) }))}
          marcados={marcas.map((x) => Number(x.linea_id))} />
      )}
    </div>
  );
}
