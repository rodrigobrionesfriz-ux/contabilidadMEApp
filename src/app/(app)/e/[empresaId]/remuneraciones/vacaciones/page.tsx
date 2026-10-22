import type { Metadata } from 'next';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { contextoRemuneraciones, eventosVacaciones, unirEventos } from '@/lib/datos/remuneraciones';
import { saldoVacaciones, feriadosAnio, textoFeriados } from '@/remuneraciones/vacaciones';
import { param, hoyISO } from '@/lib/formato';
import { SelectorPeriodo } from '@/components/selector-periodo';
import { Pestanas } from '../pestanas';
import { Vacaciones, type FilaVac } from './vacaciones';
import { anioContable } from '@/lib/anio-contable';

export const metadata: Metadata = { title: 'Vacaciones' };

export default async function VacacionesPage({ params, searchParams }: PageProps<'/e/[empresaId]/remuneraciones/vacaciones'>) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const anio = Number(param(sp.anio)) || await anioContable();
  const mes = Number(param(sp.mes)) || new Date().getMonth() + 1;
  const empresa = await requerirEmpresa(empresaId);
  const [{ ctx, trabajadores, feriados }, vac] = await Promise.all([contextoRemuneraciones(empresaId, anio), eventosVacaciones(empresaId)]);
  const finMes = new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);
  const corte = finMes < hoyISO() ? finMes : hoyISO();
  const eventos = unirEventos(ctx.eventos, vac);
  const filas: FilaVac[] = trabajadores.filter((t) => t.activo).map((t) => {
    const s = saldoVacaciones(t, corte, eventos, feriados);
    const v = (t.vacaciones || {}) as { aniosPrevios?: number; saldoInicial?: number | null; fechaSaldo?: string; zonaExtrema?: boolean };
    return {
      id: t.id, nombre: t.nombre, cfg: { aniosPrevios: String(v.aniosPrevios || ''), saldoInicial: v.saldoInicial == null ? '' : String(v.saldoInicial).replace('.', ','), fechaSaldo: v.fechaSaldo || '', zonaExtrema: !!v.zonaExtrema },
      saldo: s.ok ? {
        inicio: s.inicio, mesesTot: s.mesesTot, anual: s.anual, progActual: s.progActual, faltan: s.faltan, inicial: s.tieneInicial ? s.inicial : null, desdeDev: s.desdeDev,
        devengado: s.devengado, diasTomados: s.diasTomados, saldo: s.saldo, excede: s.excedeAcumulacion, aniosPrevios: s.aniosPrevios,
        tomadas: [...s.tomadas].sort((a, b) => b.desde.localeCompare(a.desde)).slice(0, 6).map((e) => ({ id: e.id!, desde: e.desde, hasta: e.hasta || e.desde, habiles: e.habiles, feriados: e.feriados.length })),
      } : null,
      motivo: s.ok ? undefined : s.motivo,
    };
  });
  const nFeriados = [...feriadosAnio(anio).keys()].filter((k) => !feriados.quitar.includes(k)).length + feriados.extra.filter((x) => x.fecha.startsWith(String(anio))).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Vacaciones · saldos al {corte.split('-').reverse().join('/')}</h1>
          <p className="text-sm text-tenue">Feriado legal (Arts. 67 a 70 del Código del Trabajo): 15 días hábiles por año (20 en zonas extremas), 1,25 por mes. Progresivos: con 10 años de trabajo se suma 1 día por cada 3 años nuevos con este empleador. Se pueden acumular hasta 2 períodos.</p>
        </div>
        <SelectorPeriodo anio={anio} mes={mes} etiquetaMes="Corte" conAnioCompleto={false} />
      </div>
      <Pestanas empresaId={empresaId} activa="/vacaciones" query={`?anio=${anio}&mes=${mes}`} />
      <Vacaciones empresaId={empresaId} filas={filas} escribe={puedeEscribir(empresa.rol)} admin={empresa.rol === 'admin'}
        feriadosTexto={textoFeriados(feriados)} nFeriados={nFeriados} anio={anio} feriados={feriados}/>
    </div>
  );
}
