import type { Metadata } from 'next';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { saldosAuxiliar, cuentasDeTesoreria } from '@/lib/datos/auxiliares';
import { hoyISO, param } from '@/lib/formato';
import type { TipoAuxiliar } from '@/auxiliares/saldos';
import { Pagos, type Pendiente } from './pagos';
import { HistorialPagos, type FilaHistorial } from './historial';
import { crearClienteServidor } from '@/lib/supabase/server';
import { traerTodo } from '@/lib/paginar';
import { anioContable } from '@/lib/anio-contable';

export const metadata: Metadata = { title: 'Pagos y cobros' };

export default async function PagosPage({ params, searchParams }: PageProps<'/e/[empresaId]/pagos'>) {
  const { empresaId } = await params;
  const t = param((await searchParams).tipo);
  const empresa = await requerirEmpresa(empresaId);
  if (!puedeEscribir(empresa.rol)) return <p className="text-tenue">Tu rol no permite registrar pagos.</p>;
  if (t === 'historial') {
    const anio = await anioContable();
    return <HistorialPagos empresaId={empresaId} anio={anio} filas={await historialPagos(empresaId, anio)} />;
  }
  const tipo: TipoAuxiliar = t === 'cliente' || t === 'honorario' ? t : 'proveedor';
  const hoy = hoyISO();
  const [saldos, cuentas] = await Promise.all([saldosAuxiliar(empresaId, tipo, hoy), cuentasDeTesoreria(empresaId)]);
  const pendientes: Pendiente[] = saldos.flatMap((s) => s.items.filter((i) => i.folio && i.saldo > 0).map((i) => ({
    clave: i.clave, rut: s.rut, razon: s.razon, tipo_dte: i.tipo_dte, folio: i.folio!, fecha: i.fecha, vence: i.vence, saldo: i.saldo,
  }))).sort((a, b) => a.vence.localeCompare(b.vence));
  const aFavor = saldos.filter((s) => s.aFavor < 0).map((s) => ({ rut: s.rut, razon: s.razon, monto: -s.aFavor }));
  return <Pagos key={tipo} empresaId={empresaId} tipo={tipo} pendientes={pendientes} cuentas={cuentas} aFavor={aFavor} hoy={hoy} />;
}

type LineaPago = { asiento_id: string; cuenta: string; debe: number; haber: number; rut_auxiliar: string | null; folio: string | null };

/** Comprobantes de pago y cobro del año (asientos tipo 'pago') con sus auxiliares, folios, cuenta de banco y monto. */
async function historialPagos(empresaId: string, anio: number): Promise<FilaHistorial[]> {
  const supabase = await crearClienteServidor();
  const asientos = await traerTodo((d, h) => supabase.from('asientos').select('id,numero,fecha,glosa,anulado')
    .eq('empresa_id', empresaId).eq('tipo', 'pago').eq('anio', anio).order('fecha', { ascending: false }).order('numero', { ascending: false }).range(d, h)) as
    { id: string; numero: number; fecha: string; glosa: string | null; anulado: boolean }[];
  if (!asientos.length) return [];
  const lineas = await traerTodo((d, h) => supabase.from('asiento_lineas').select('asiento_id,cuenta,debe,haber,rut_auxiliar,folio,asientos!inner(tipo,anio)')
    .eq('empresa_id', empresaId).eq('asientos.tipo', 'pago').eq('asientos.anio', anio).order('orden').range(d, h)) as unknown as LineaPago[];
  const ruts = [...new Set(lineas.map((l) => l.rut_auxiliar).filter(Boolean))] as string[];
  const [cuentas, fichas, docs] = await Promise.all([
    traerTodo((d, h) => supabase.from('cuentas').select('codigo,nombre,tipo_auxiliar').eq('empresa_id', empresaId).order('codigo').range(d, h)),
    ruts.length ? supabase.from('auxiliares').select('rut,razon_social').eq('empresa_id', empresaId).in('rut', ruts) : Promise.resolve({ data: [] }),
    ruts.length ? supabase.from('documentos').select('rut,razon_social').eq('empresa_id', empresaId).in('rut', ruts).not('razon_social', 'is', null).limit(2000) : Promise.resolve({ data: [] }),
  ]);
  const cta = new Map((cuentas as { codigo: string; nombre: string; tipo_auxiliar: string | null }[]).map((c) => [c.codigo, c]));
  const nombre = new Map<string, string>();
  for (const d of (docs.data ?? []) as { rut: string; razon_social: string }[]) nombre.set(d.rut, d.razon_social);
  for (const f of (fichas.data ?? []) as { rut: string; razon_social: string }[]) nombre.set(f.rut, f.razon_social);
  const porAsiento = new Map<string, LineaPago[]>();
  for (const l of lineas) (porAsiento.get(l.asiento_id) ?? porAsiento.set(l.asiento_id, []).get(l.asiento_id)!).push(l);
  return asientos.map((a) => {
    const ls = porAsiento.get(a.id) ?? [];
    const aux = ls.filter((l) => cta.get(l.cuenta)?.tipo_auxiliar);
    const banco = ls.filter((l) => l.cuenta.startsWith('1101'));
    const ta = cta.get(aux[0]?.cuenta ?? '')?.tipo_auxiliar;
    const tipo: FilaHistorial['tipo'] = ta === 'cliente' ? 'cliente' : ta === 'honorario' ? 'honorario' : 'proveedor';
    const rutsA = [...new Set(aux.map((l) => l.rut_auxiliar).filter(Boolean))] as string[];
    const monto = banco.length ? banco.reduce((s, l) => s + Number(l.debe) + Number(l.haber), 0) : ls.reduce((s, l) => s + Number(l.debe), 0);
    return {
      id: a.id, numero: a.numero, fecha: String(a.fecha).slice(0, 10), glosa: a.glosa ?? '', anulado: !!a.anulado, tipo,
      nombres: rutsA.map((r) => nombre.get(r) || r), ruts: rutsA, folios: [...new Set(aux.map((l) => l.folio).filter(Boolean))] as string[],
      cuenta: banco[0] ? `${banco[0].cuenta} · ${cta.get(banco[0].cuenta)?.nombre ?? ''}` : '', monto,
    };
  });
}
