import type { Metadata } from 'next';
import Link from 'next/link';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { traerTodo } from '@/lib/paginar';
import { param } from '@/lib/formato';
import { FormApertura, type CuentaApertura, type LineaInicial } from './form';
import { anioContable } from '@/lib/anio-contable';

export const metadata: Metadata = { title: 'Balance de apertura' };

export default async function AperturaPage({ params, searchParams }: PageProps<'/e/[empresaId]/apertura'>) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const anio = Number(param(sp.anio)) || await anioContable();
  const empresa = await requerirEmpresa(empresaId);
  const supabase = await crearClienteServidor();

  const [cuentas, aperturas, enero, ejercicio, previo] = await Promise.all([
    traerTodo((d, h) => supabase.from('cuentas').select('codigo,nombre,tipo_auxiliar')
      .eq('empresa_id', empresaId).eq('acepta_movimientos', true).eq('activa', true)
      .or('codigo.like.1%,codigo.like.2%').order('codigo').range(d, h)),
    supabase.from('asientos').select('id,numero,glosa,anulado,motivo_anulacion,origen_id')
      .eq('empresa_id', empresaId).eq('anio', anio).eq('tipo', 'apertura').order('numero'),
    supabase.from('periodos_cerrados').select('periodo').eq('empresa_id', empresaId).eq('periodo', `${anio}-01`).maybeSingle(),
    supabase.from('ejercicios_cerrados').select('anio').eq('empresa_id', empresaId).eq('anio', anio).maybeSingle(),
    supabase.from('ejercicios_cerrados').select('anio').eq('empresa_id', empresaId).eq('anio', anio - 1).maybeSingle(),
  ]);
  if (aperturas.error) throw new Error(aperturas.error.message);

  const vigente = (aperturas.data ?? []).find((a) => !a.anulado) ?? null;
  let iniciales: LineaInicial[] = [];
  if (vigente) {
    const { data, error } = await supabase.from('asiento_lineas').select('cuenta,debe,haber,rut_auxiliar,tipo_dte,folio,glosa')
      .eq('asiento_id', vigente.id).order('orden');
    if (error) throw new Error(error.message);
    iniciales = (data ?? []).map((l) => ({
      cuenta: l.cuenta, debe: Number(l.debe), haber: Number(l.haber), rut: l.rut_auxiliar ?? '',
      dte: l.tipo_dte != null ? String(l.tipo_dte) : '', folio: l.folio ?? '', glosa: l.glosa ?? '',
    }));
  }
  const bloqueo = ejercicio.data ? `El ejercicio ${anio} está cerrado: reábrelo en Cierre del ejercicio para cambiar la apertura.`
    : enero.data ? `Enero de ${anio} está cerrado: reábrelo en Cierre del ejercicio para cambiar la apertura.` : null;
  const anios = Array.from({ length: 8 }, (_, i) => new Date().getFullYear() + 1 - i);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Balance de apertura {anio}</h1>
          <p className="text-sm text-tenue">Asiento N° 0 al 1 de enero con los saldos iniciales de las cuentas de balance (activo, pasivo y patrimonio).</p>
        </div>
        <form className="flex items-end gap-2">
          <div><label className="etiqueta" htmlFor="anio">Año</label>
            <select id="anio" name="anio" defaultValue={anio} className="campo w-28">{anios.map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
          <button className="boton-sec">Ver</button>
        </form>
      </div>

      <div className="tarjeta space-y-1 p-4 text-sm">
        {vigente ? (
          <p>✅ {anio} tiene apertura vigente: <Link className="text-acento hover:underline" href={`/e/${empresaId}/asientos/${vigente.id}`}>asiento N° {vigente.numero}</Link> · {vigente.glosa}
            {vigente.origen_id === `apertura:${anio}` && <span className="text-tenue"> (generada desde el cierre de {anio - 1})</span>}</p>
        ) : (
          <p>⚠️ {anio} no tiene apertura. Sin ella, el balance no muestra el capital ni los saldos con que partieron bancos, clientes y proveedores.</p>
        )}
        {(aperturas.data ?? []).filter((a) => a.anulado).map((a) => (
          <p key={a.id} className="text-xs text-tenue">N° {a.numero} anulado{a.motivo_anulacion ? `: ${a.motivo_anulacion}` : ''}</p>
        ))}
        {bloqueo && <p className="text-aviso">{bloqueo}</p>}
      </div>

      <FormApertura
        empresaId={empresaId} anio={anio} cuentas={cuentas as CuentaApertura[]} iniciales={iniciales}
        glosaInicial={vigente?.glosa ?? `Balance de apertura ${anio}`} existe={!!vigente}
        puedeGenerar={!vigente && !!previo.data} escribe={puedeEscribir(empresa.rol) && !bloqueo}
      />
    </div>
  );
}
