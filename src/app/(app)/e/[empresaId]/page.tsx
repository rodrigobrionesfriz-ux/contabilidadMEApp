import Link from 'next/link';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { clp } from '@/lib/formato';

export default async function InicioEmpresa({ params }: PageProps<'/e/[empresaId]'>) {
  const { empresaId } = await params;
  const empresa = await requerirEmpresa(empresaId);
  const anio = new Date().getFullYear();
  const supabase = await crearClienteServidor();
  const [asientos, cuentas, saldos] = await Promise.all([
    supabase.from('asientos').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('anio', anio).eq('anulado', false),
    supabase.from('cuentas').select('codigo', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('acepta_movimientos', true),
    supabase.from('saldos_cuentas').select('debe').eq('empresa_id', empresaId).eq('anio', anio),
  ]);
  const movido = (saldos.data ?? []).reduce((s, r) => s + Number(r.debe), 0);
  const tarjetas = [
    [`Asientos ${anio}`, String(asientos.count ?? 0)],
    ['Total debe del año', clp(movido)],
    ['Cuentas imputables', String(cuentas.count ?? 0)],
  ];
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{empresa.razon_social}</h1>
      <div className="grid gap-3 sm:grid-cols-3">
        {tarjetas.map(([t, v]) => (
          <div key={t} className="tarjeta p-4">
            <div className="text-xs text-tenue uppercase">{t}</div>
            <div className="num mt-1 text-2xl font-semibold">{v}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={`/e/${empresaId}/diario`} className="boton-sec">📖 Ver libro diario</Link>
        {puedeEscribir(empresa.rol) && <Link href={`/e/${empresaId}/asientos/nuevo`} className="boton">✍️ Nuevo asiento</Link>}
      </div>
      <p className="text-sm text-tenue">
        Versión en migración (fase 0). Los módulos de compras, ventas, honorarios, remuneraciones y reportes se agregarán por fases.
        El sistema actual sigue siendo el oficial.
      </p>
    </div>
  );
}
