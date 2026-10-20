import 'server-only';
import { crearClienteServidor } from '@/lib/supabase/server';
import { primerosPasos, avancePasos } from '@/empresa/primeros-pasos';

/** Estado de la guía de puesta en marcha de una empresa (conteos livianos, en paralelo). */
export async function estadoPrimerosPasos(empresaId: string) {
  const supabase = await crearClienteServidor();
  const hoy = new Date();
  const ant = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  const perAnt = `${ant.getFullYear()}-${String(ant.getMonth() + 1).padStart(2, '0')}`;
  const n = (q: PromiseLike<{ count: number | null }>) => Promise.resolve(q).then((r) => r.count ?? 0);
  const contar = (t: string, f?: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => { const q = base(t); return n(f ? f(q) : q); };
  const base = (t: string) => supabase.from(t).select('*', { count: 'exact', head: true }).eq('empresa_id', empresaId);
  const [emp, cuentas, centros, apertura, importado, uf, auxiliares, trabajadores, parametros, miembros] = await Promise.all([
    supabase.from('empresas').select('regimen,representante,rut_representante,giro,domicilio,comuna,tasa_ppm,primeros_pasos').eq('id', empresaId).maybeSingle(),
    contar('cuentas', (q) => q.eq('acepta_movimientos', true)),
    contar('centros_costo'),
    contar('asientos', (q) => q.eq('tipo', 'apertura').eq('anulado', false)),
    contar('importaciones'),
    supabase.from('indicadores').select('uf').eq('periodo', perAnt).maybeSingle(),
    contar('auxiliares'),
    contar('trabajadores'),
    contar('empresa_parametros'),
    contar('miembros', (q) => q.eq('estado', 'activo')),
  ]);
  const e = emp.data as { regimen: string | null; representante: string | null; rut_representante: string | null; giro: string | null; domicilio: string | null; comuna: string | null; tasa_ppm: number | null; primeros_pasos: Record<string, string> | null } | null;
  const pasos = primerosPasos({
    regimen: e?.regimen ?? null, representante: e?.representante ?? null, tasaPpm: e?.tasa_ppm ?? null,
    ficha: { giro: e?.giro ?? null, domicilio: e?.domicilio ?? null, comuna: e?.comuna ?? null, rut_representante: e?.rut_representante ?? null },
    cuentas, centros, apertura: apertura > 0, importado: importado > 0, ufMesAnterior: !!uf.data?.uf,
    auxiliares, trabajadores, parametrosRem: parametros > 0, miembros, marcas: e?.primeros_pasos ?? {},
  });
  return { pasos, ...avancePasos(pasos) };
}
