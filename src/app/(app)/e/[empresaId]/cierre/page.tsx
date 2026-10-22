import type { Metadata } from 'next';
import Link from 'next/link';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { contextoFiniquitos, indicadoresMes } from '@/lib/datos/remuneraciones';
import { saldosDesde, saldoPres, resultadoEjercicio, type FilaSuma } from '@/estados/eeff';
import { regimenInfo } from '@/estados/regimenes';
import { calcularLiquidacion } from '@/remuneraciones/calculo';
import { saldoVacaciones } from '@/remuneraciones/vacaciones';
import { habilesACorridos } from '@/remuneraciones/finiquito';
import { param, hoyISO } from '@/lib/formato';
import { Cierre, type DatosCierre } from './cierre';
import { anioContable } from '@/lib/anio-contable';

export const metadata: Metadata = { title: 'Cierre del ejercicio' };

export default async function CierrePage({ params, searchParams }: PageProps<'/e/[empresaId]/cierre'>) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const anio = Number(param(sp.anio)) || await anioContable();
  const empresa = await requerirEmpresa(empresaId);
  const supabase = await crearClienteServidor();
  const [sal, per, ejc, cierres, apert, emp] = await Promise.all([
    supabase.rpc('saldos_periodo', { p_empresa: empresaId, p_desde: `${anio}-01-01`, p_hasta: `${anio}-12-31`, p_excluir_cierre: true }),
    supabase.from('periodos_cerrados').select('periodo,cerrado_en').eq('empresa_id', empresaId).like('periodo', `${anio}-%`),
    supabase.from('ejercicios_cerrados').select('anio,resultado,cerrado_en,meses_previos').eq('empresa_id', empresaId).eq('anio', anio).maybeSingle(),
    supabase.from('asientos').select('numero,fecha,anulado,motivo_anulacion').eq('empresa_id', empresaId).eq('anio', anio).eq('tipo', 'cierre').order('numero'),
    supabase.from('asientos').select('numero,anulado').eq('empresa_id', empresaId).eq('anio', anio + 1).eq('tipo', 'apertura').eq('anulado', false),
    supabase.from('empresas').select('regimen').eq('id', empresaId).single(),
  ]);
  const M = saldosDesde((sal.data ?? []) as FilaSuma[]);
  const res = resultadoEjercicio(M);
  const reg = regimenInfo(emp.data?.regimen);
  const s = (cd: string) => M[cd]?.saldo ?? 0;
  const capital = Object.keys(M).filter((k) => k.startsWith('23') && Math.abs(M[k].saldo) >= 0.5).reduce((t, k) => t + Math.abs(M[k].saldo), 0);

  // Provisión de feriado sugerida: saldo de vacaciones de cada trabajador vigente al 31-12 (o hoy), en días corridos × remuneración diaria. Los finiquitados ya cobraron su feriado.
  const corte = `${anio}-12-31` < hoyISO() ? `${anio}-12-31` : hoyISO();
  const vac: DatosCierre['vacaciones'] = [];
  try {
    const { ctx, trabajadores, feriados } = await contextoFiniquitos(empresaId, anio);
    const ind = indicadoresMes(ctx.P, anio, 12);
    for (const t of trabajadores.filter((x) => x.activo && !(x.lre?.fechaTermino && x.lre.fechaTermino <= corte))) {
      const sv = saldoVacaciones(t, corte, ctx.eventos, feriados);
      if (!sv.ok || sv.saldo <= 0) { vac.push({ nombre: t.nombre, saldo: sv.ok ? sv.saldo : null, corridos: 0, diario: 0, monto: 0, motivo: sv.ok ? undefined : sv.motivo }); continue; }
      const l = calcularLiquidacion(t, ind.uf, ind.utm, undefined, ctx.P, ctx.libros);
      const diario = (l.base + l.otros + l.grat) / 30;
      const corridos = habilesACorridos(corte, sv.saldo, feriados).corridos;
      vac.push({ nombre: t.nombre, saldo: sv.saldo, corridos, diario: Math.round(diario), monto: Math.round(diario * corridos) });
    }
  } catch { /* sin remuneraciones */ }

  const meses = Array.from({ length: 12 }, (_, i) => `${anio}-${String(i + 1).padStart(2, '0')}`);
  const cerradosMes = new Map((per.data ?? []).map((p) => [p.periodo, p.cerrado_en as string]));
  const vigente = (cierres.data ?? []).find((a) => !a.anulado) || null;
  const datos: DatosCierre = {
    anio, meses: meses.map((p) => ({ periodo: p, cerrado: cerradosMes.has(p), cerradoEn: cerradosMes.get(p) || null })),
    resultado: res, cierre: vigente ? { numero: vigente.numero, fecha: String(vigente.fecha).slice(0, 10), cerradoEn: ejc.data?.cerrado_en ?? null } : null,
    anulados: (cierres.data ?? []).filter((a) => a.anulado).map((a) => ({ numero: a.numero, motivo: a.motivo_anulacion || '' })),
    apertura: apert.data?.[0] ? { numero: apert.data[0].numero } : null,
    clientes: Math.max(0, s('1104001')), estimacion: Math.max(0, -s('1105001')), provVacaciones: Math.max(0, saldoPres('2105004', s('2105004'))),
    vacaciones: vac, capital, regimen: { k: reg.k, corto: reg.corto, nm: reg.nm, correccionMonetaria: reg.correccionMonetaria },
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Cierre del ejercicio {anio}</h1>
          <p className="text-sm text-tenue">Orden sugerido: registra la <Link className="text-acento hover:underline" href={`/e/${empresaId}/activo-fijo?anio=${anio}`}>depreciación</Link> y las provisiones, revisa los <Link className="text-acento hover:underline" href={`/e/${empresaId}/estados?anio=${anio}`}>estados financieros</Link>, cierra el ejercicio y genera la apertura de {anio + 1}.</p>
        </div>
        <form className="flex items-end gap-2">
          <div><label className="etiqueta" htmlFor="anio">Año</label>
            <select id="anio" name="anio" defaultValue={anio} className="campo w-28">{Array.from({ length: 8 }, (_, i) => new Date().getFullYear() + 1 - i).map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
          <button className="boton-sec">Ver</button>
        </form>
      </div>
      <Cierre empresaId={empresaId} d={datos} escribe={puedeEscribir(empresa.rol)} admin={empresa.rol === 'admin'} />
    </div>
  );
}
