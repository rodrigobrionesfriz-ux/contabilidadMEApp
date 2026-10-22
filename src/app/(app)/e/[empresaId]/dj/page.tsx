import type { Metadata } from 'next';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { traerTodo } from '@/lib/paginar';
import { contextoRenta } from '@/lib/datos/renta';
import { retencionHonorarios } from '@/importador/respaldo';
import { regimenInfo } from '@/estados/regimenes';
import { DJ_SEMILLA, resumenHonorarios, resumenSueldos, resumenRLI, resumenPresunta, resumenBalance, type DJ, type EstadoDJ, type Resumen } from '@/tributario/dj';
import { param, hoyISO } from '@/lib/formato';
import { Declaraciones } from './declaraciones';
import { anioContable } from '@/lib/anio-contable';

export const metadata: Metadata = { title: 'Declaraciones juradas' };

export default async function DJPage({ params, searchParams }: PageProps<'/e/[empresaId]/dj'>) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const anio = Number(param(sp.anio)) || await anioContable() - 1;
  const at = anio + 1;
  const empresa = await requerirEmpresa(empresaId);
  const supabase = await crearClienteServidor();
  const [cat, est, libros, hon, ctx] = await Promise.all([
    supabase.from('dj_catalogo').select('catalogo').eq('empresa_id', empresaId).maybeSingle(),
    supabase.from('dj_estados').select('estados').eq('empresa_id', empresaId).eq('anio_tributario', at).maybeSingle(),
    supabase.from('libros_remuneraciones').select('lineas,totales').eq('empresa_id', empresaId).gte('periodo', `${anio}-01`).lte('periodo', `${anio}-12`),
    traerTodo((d, h) => supabase.from('documentos').select('total,rut,estado').eq('empresa_id', empresaId).eq('tipo', 'honorario').eq('anio', anio).range(d, h)),
    contextoRenta(empresaId, anio),
  ]);
  const propio = Array.isArray(cat.data?.catalogo) && cat.data.catalogo.length > 0;
  const catalogo: DJ[] = propio ? (cat.data!.catalogo as DJ[]) : DJ_SEMILLA;
  const estados = (est.data?.estados as Record<string, EstadoDJ>) || {};
  const boletas = (hon as { total: number; rut: string | null; estado: string | null }[]).filter((h) => h.estado !== 'anulado').map((h) => ({ bruto: Number(h.total), rut: h.rut }));
  // Las cifras de renta usan la declaración guardada (régimen y ajustes) de la pantalla de renta anual.
  const resumenes: Record<string, Resumen | null> = {
    honorarios: resumenHonorarios(boletas, retencionHonorarios(anio)),
    sueldos: resumenSueldos((libros.data ?? []) as { lineas: unknown[]; totales: { totalHaberes?: number; iusc?: number } }[]),
    rli: ctx.R.reg.rentaPresunta ? null : resumenRLI(ctx.R),
    presunta: resumenPresunta(ctx.R),
    balance: resumenBalance(ctx.filas),
  };
  const regimen = ctx.empresa.regimen;
  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Declaraciones juradas · AT {at}</h1>
          <p className="text-sm text-tenue">Ejercicio comercial {anio} · régimen {regimenInfo(regimen).corto} {regimenInfo(regimen).nm}. El régimen se cambia en Configuración → Empresa.</p>
        </div>
        <form className="flex items-end gap-2">
          <div><label className="etiqueta" htmlFor="anio">Año comercial</label>
            <select id="anio" name="anio" defaultValue={anio} className="campo w-28">{Array.from({ length: 8 }, (_, i) => new Date().getFullYear() - i).map((y) => <option key={y} value={y}>{y}</option>)}</select></div>
          <button className="boton-sec">Ver</button>
        </form>
      </div>
      <Declaraciones empresaId={empresaId} anio={anio} at={at} regimen={regimen} catalogo={catalogo} propio={propio} estados={estados} resumenes={resumenes}
        empresa={{ nombre: ctx.empresa.nombre, rut: ctx.empresa.rut }} escribe={puedeEscribir(empresa.rol)} hoy={hoyISO()} />
    </div>
  );
}
