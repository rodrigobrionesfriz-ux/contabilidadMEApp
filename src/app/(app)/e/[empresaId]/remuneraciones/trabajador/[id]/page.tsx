import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { contextoRemuneraciones, indicadoresMes } from '@/lib/datos/remuneraciones';
import { cuentasDeTesoreria } from '@/lib/datos/auxiliares';
import { FormTrabajador } from './form';
import { Anticipos } from './anticipos';

export const metadata: Metadata = { title: 'Ficha del trabajador' };

export default async function TrabajadorPage({ params }: PageProps<'/e/[empresaId]/remuneraciones/trabajador/[id]'>) {
  const { empresaId, id } = await params;
  const empresa = await requerirEmpresa(empresaId);
  const hoy = new Date();
  const anio = hoy.getFullYear(), mes = hoy.getMonth() + 1;
  const [{ ctx, trabajadores, libros }, tesoreria] = await Promise.all([contextoRemuneraciones(empresaId, anio), cuentasDeTesoreria(empresaId)]);
  const t = id === 'nuevo' ? null : trabajadores.find((x) => x.id === id);
  if (id !== 'nuevo' && !t) notFound();
  const { uf, utm } = indicadoresMes(ctx.P, anio, mes);
  const escribe = puedeEscribir(empresa.rol);
  return (
    <div className="max-w-6xl space-y-4">
      <Link href={`/e/${empresaId}/remuneraciones`} className="text-sm text-tenue hover:text-texto">← Trabajadores</Link>
      <h1 className="text-xl font-semibold">{t ? t.nombre : 'Nuevo trabajador'}</h1>
      <FormTrabajador empresaId={empresaId} trabajador={t ?? null} ctx={ctx} uf={uf} utm={utm} anio={anio} mes={mes} escribe={escribe} />
      {t && <Anticipos empresaId={empresaId} trabajador={t} cerrados={libros.map((l) => l.periodo)} tesoreria={tesoreria} escribe={escribe} />}
    </div>
  );
}
