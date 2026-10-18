import type { Metadata } from 'next';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { saldosAuxiliar, cuentasDeTesoreria } from '@/lib/datos/auxiliares';
import { hoyISO, param } from '@/lib/formato';
import type { TipoAuxiliar } from '@/auxiliares/saldos';
import { Pagos, type Pendiente } from './pagos';

export const metadata: Metadata = { title: 'Pagos y cobros' };

export default async function PagosPage({ params, searchParams }: PageProps<'/e/[empresaId]/pagos'>) {
  const { empresaId } = await params;
  const t = param((await searchParams).tipo);
  const tipo: TipoAuxiliar = t === 'cliente' || t === 'honorario' ? t : 'proveedor';
  const empresa = await requerirEmpresa(empresaId);
  if (!puedeEscribir(empresa.rol)) return <p className="text-tenue">Tu rol no permite registrar pagos.</p>;
  const hoy = hoyISO();
  const [saldos, cuentas] = await Promise.all([saldosAuxiliar(empresaId, tipo, hoy), cuentasDeTesoreria(empresaId)]);
  const pendientes: Pendiente[] = saldos.flatMap((s) => s.items.filter((i) => i.folio && i.saldo > 0).map((i) => ({
    clave: i.clave, rut: s.rut, razon: s.razon, tipo_dte: i.tipo_dte, folio: i.folio!, fecha: i.fecha, vence: i.vence, saldo: i.saldo,
  }))).sort((a, b) => a.vence.localeCompare(b.vence));
  const aFavor = saldos.filter((s) => s.aFavor < 0).map((s) => ({ rut: s.rut, razon: s.razon, monto: -s.aFavor }));
  return <Pagos key={tipo} empresaId={empresaId} tipo={tipo} pendientes={pendientes} cuentas={cuentas} aFavor={aFavor} hoy={hoy} />;
}
