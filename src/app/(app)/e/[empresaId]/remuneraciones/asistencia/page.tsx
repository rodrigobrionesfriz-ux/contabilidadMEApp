import type { Metadata } from 'next';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { contextoRemuneraciones } from '@/lib/datos/remuneraciones';
import { asistenciaMes } from '@/remuneraciones/calculo';
import { param, MESES } from '@/lib/formato';
import { SelectorPeriodo } from '@/components/selector-periodo';
import { Pestanas } from '../pestanas';
import { Asistencia } from './asistencia';
import { anioContable } from '@/lib/anio-contable';

export const metadata: Metadata = { title: 'Asistencia' };

export default async function AsistenciaPage({ params, searchParams }: PageProps<'/e/[empresaId]/remuneraciones/asistencia'>) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const anio = Number(param(sp.anio)) || await anioContable();
  const mes = Number(param(sp.mes)) || new Date().getMonth() + 1;
  const empresa = await requerirEmpresa(empresaId);
  const { ctx, trabajadores, libros } = await contextoRemuneraciones(empresaId, anio);
  const periodo = `${anio}-${String(mes).padStart(2, '0')}`;
  const activos = trabajadores.filter((t) => t.activo);
  const resumen = activos.map((t) => ({ id: t.id, nombre: t.nombre, porHora: t.tipoPago === 'hora', a: asistenciaMes(t, anio, mes, ctx.eventos, ctx.horas) }));
  const ini = `${periodo}-01`, fin = new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);
  const eventos = ctx.eventos.filter((e) => e.desde <= fin && (e.hasta ?? e.desde) >= ini);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-semibold">Asistencia · {MESES[mes - 1]} {anio}</h1>
        <SelectorPeriodo anio={anio} mes={mes} etiquetaMes="Mes" conAnioCompleto={false} />
      </div>
      <Pestanas empresaId={empresaId} activa="/asistencia" query={`?anio=${anio}&mes=${mes}`} />
      <Asistencia empresaId={empresaId} periodo={periodo} cerrado={libros.some((l) => l.periodo === periodo)} escribe={puedeEscribir(empresa.rol)}
        trabajadores={activos.map((t) => ({ id: t.id, nombre: t.nombre }))} eventos={eventos} resumen={resumen} />
    </div>
  );
}
