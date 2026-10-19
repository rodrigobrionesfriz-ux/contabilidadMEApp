import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { traerTodo } from '@/lib/paginar';
import type { DocumentoAsiento } from '@/motor/edicion';
import { EditorAsiento, type CuentaEdicion, type LineaInicial } from './form';

export const metadata: Metadata = { title: 'Editar comprobante' };

export default async function EditarAsientoPage({ params }: PageProps<'/e/[empresaId]/asientos/[id]/editar'>) {
  const { empresaId, id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const empresa = await requerirEmpresa(empresaId);
  const supabase = await crearClienteServidor();
  const [a, lineas, docs, cuentas, centros] = await Promise.all([
    supabase.from('asientos').select('id,numero,anio,fecha,glosa,tipo,anulado').eq('id', id).eq('empresa_id', empresaId).maybeSingle(),
    supabase.from('asiento_lineas').select('cuenta,debe,haber,glosa,centro_costo,rut_auxiliar,tipo_dte,folio').eq('asiento_id', id).order('orden'),
    supabase.from('documentos').select('tipo,tipo_dte,folio,rut,iva,total,datos').eq('asiento_id', id).eq('empresa_id', empresaId),
    traerTodo((d, h) => supabase.from('cuentas').select('codigo,nombre,tipo_auxiliar,acepta_centro_costo,requiere_centro_costo')
      .eq('empresa_id', empresaId).eq('acepta_movimientos', true).eq('activa', true).order('codigo').range(d, h)),
    supabase.from('centros_costo').select('codigo,nombre').eq('empresa_id', empresaId).eq('activo', true).order('codigo'),
  ]);
  if (!a.data) notFound();
  const x = a.data;
  const volver = <Link href={`/e/${empresaId}/asientos/${id}`} className="boton-sec">← Volver al comprobante</Link>;

  const motivoNo = !puedeEscribir(empresa.rol) ? `Tu rol (${empresa.rol}) no permite editar asientos.`
    : x.anulado ? 'El asiento está anulado y no se puede editar.'
    : x.tipo === 'cierre' ? 'El asiento de cierre no se edita: reabre el ejercicio en Cierre del ejercicio.'
    : null;
  if (x.tipo === 'apertura') {
    return <div className="space-y-3">{volver}<p className="text-sm">La apertura se edita en <Link className="text-acento hover:underline" href={`/e/${empresaId}/apertura?anio=${x.anio}`}>Configuración → Balance de apertura</Link>.</p></div>;
  }
  if (motivoNo) return <div className="space-y-3">{volver}<p className="text-sm text-aviso">{motivoNo}</p></div>;

  const { data: cerrados } = await supabase.from('periodos_cerrados').select('periodo').eq('empresa_id', empresaId).like('periodo', `${x.anio}-%`);
  const mesesCerrados = (cerrados ?? []).map((p) => p.periodo as string);
  if (mesesCerrados.includes(String(x.fecha).slice(0, 7))) {
    return <div className="space-y-3">{volver}<p className="text-sm text-aviso">El período {String(x.fecha).slice(0, 7)} está cerrado: reábrelo en Cierre del ejercicio para editar este asiento.</p></div>;
  }

  const iniciales: LineaInicial[] = (lineas.data ?? []).map((l) => ({
    cuenta: l.cuenta, debe: Number(l.debe), haber: Number(l.haber), glosa: l.glosa ?? '', cc: l.centro_costo ?? '',
    rut: l.rut_auxiliar ?? '', dte: l.tipo_dte != null ? String(l.tipo_dte) : '', folio: l.folio ?? '',
  }));
  const documentos: DocumentoAsiento[] = (docs.data ?? []).map((d) => {
    const datos = (d.datos ?? {}) as { ivaRecuperable?: number; origenRegistro?: string };
    return { tipo: d.tipo, tipo_dte: d.tipo_dte, folio: d.folio, rut: d.rut, iva: Number(d.iva), total: Number(d.total),
      ivaRecuperable: datos.ivaRecuperable != null ? Number(datos.ivaRecuperable) : null, origen: datos.origenRegistro ?? null };
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Editar comprobante N° {x.numero} <span className="text-sm font-normal text-tenue">· {x.tipo}</span></h1>
        {volver}
      </div>
      <EditorAsiento empresaId={empresaId} id={id} numero={x.numero} anio={x.anio} fechaInicial={String(x.fecha).slice(0, 10)} glosaInicial={x.glosa}
        iniciales={iniciales} cuentas={cuentas as CuentaEdicion[]} centros={centros.data ?? []} documentos={documentos} mesesCerrados={mesesCerrados} />
    </div>
  );
}
