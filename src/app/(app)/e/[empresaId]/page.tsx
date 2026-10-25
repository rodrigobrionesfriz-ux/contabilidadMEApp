import Link from 'next/link';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { clp, param } from '@/lib/formato';
import { estadoPrimerosPasos } from '@/lib/datos/primeros-pasos';
import { MODULOS } from '@/lib/modulos';
import { VentanaPrimerosPasos } from './primeros-pasos/ventana';
import { anioContable } from '@/lib/anio-contable';

export default async function InicioEmpresa({ params, searchParams }: PageProps<'/e/[empresaId]'>) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const bienvenida = param(sp.bienvenida) === '1';
  const sinAcceso = MODULOS.find((m) => m.k === param(sp.sin_acceso));
  const empresa = await requerirEmpresa(empresaId);
  const anio = await anioContable();
  const supabase = await crearClienteServidor();
  const [pp, asientos, cuentas, saldos] = await Promise.all([
    estadoPrimerosPasos(empresaId),
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
      {bienvenida && <VentanaPrimerosPasos empresaId={empresaId} razonSocial={empresa.razon_social} pasos={pp.pasos} hechos={pp.hechos} total={pp.total} escribe={puedeEscribir(empresa.rol)} />}
      {sinAcceso && <p role="alert" className="rounded-md border border-aviso/40 bg-aviso/10 px-3 py-2 text-sm text-aviso">🔒 Tu perfil no tiene acceso a {sinAcceso.nombre}. Si lo necesitas, pídeselo al administrador del sistema.</p>}
      <h1 className="text-xl font-semibold">{empresa.razon_social}</h1>
      {!pp.completo && (
        <Link href={`/e/${empresaId}/primeros-pasos`} className="tarjeta block space-y-2 border-acento/50 p-4 hover:border-acento">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-semibold text-acento">🚀 Primeros pasos: {pp.hechos} de {pp.total}</span>
            <span className="text-xs text-tenue">{pp.faltanObligatorios ? `Faltan ${pp.faltanObligatorios} pasos clave · ` : ''}Siguiente: {pp.pasos.find((x) => x.estado === 'pendiente')?.titulo} →</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-panel-2"><div className="h-full bg-acento" style={{ width: `${(pp.hechos / pp.total) * 100}%` }} /></div>
        </Link>
      )}
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
          <div className="font-semibold text-acento">📥 Trae tus datos del sistema anterior</div>
          <div className="text-sm text-tenue">Sube el respaldo Excel de cada año para cargar asientos, documentos y saldos.</div>
        </Link>
      )}
    </div>
  );
}
