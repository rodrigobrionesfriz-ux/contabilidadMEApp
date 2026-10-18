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
      {empresa.rol === 'admin' && !asientos.count && (
        <Link href={`/e/${empresaId}/importar`} className="tarjeta block border-acento/50 p-4 hover:border-acento">
          <div className="font-semibold text-acento">📥 Trae tus datos del sistema actual</div>
          <div className="text-sm text-tenue">Sube el respaldo Excel de cada año y compara el balance en ambos sistemas.</div>
        </Link>
      )}
      <p className="text-sm text-tenue">Marcha blanca: mientras se comparan las cifras, el sistema actual sigue siendo el oficial.</p>
    </div>
  );
}
