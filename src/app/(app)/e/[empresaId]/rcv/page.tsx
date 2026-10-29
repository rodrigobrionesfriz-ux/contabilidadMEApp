import type { Metadata } from 'next';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { planDeEmpresa, centrosDeEmpresa } from '@/lib/datos/maestros';
import { param } from '@/lib/formato';
import { ImportadorRCV } from './importador';
import { abrirCarga, resumenCargas } from './acciones';

export const metadata: Metadata = { title: 'Importar RCV' };

export default async function RcvPage({ params, searchParams }: PageProps<'/e/[empresaId]/rcv'>) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const tipo = param(sp.tipo) === 'venta' ? 'venta' : 'compra';
  const empresa = await requerirEmpresa(empresaId);
  if (!puedeEscribir(empresa.rol)) return <p className="text-tenue">Tu rol no permite registrar documentos.</p>;
  const [plan, centros, resumen] = await Promise.all([planDeEmpresa(empresaId), centrosDeEmpresa(empresaId), resumenCargas(empresaId, tipo)]);
  // Mes inicial: el pedido en la URL; si no, el más reciente con documentos por importar; si no, el último cargado o el mes actual
  const pedido = param(sp.periodo);
  const hoy = new Date();
  const periodo = /^\d{4}-(0[1-9]|1[0-2])$/.test(pedido) ? pedido
    : resumen.find((r) => r.pendientes > 0)?.periodo ?? resumen[0]?.periodo ?? `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  const carga = await abrirCarga(empresaId, tipo, periodo);
  return <ImportadorRCV key={`${tipo}-${periodo}`} empresaId={empresaId} tipo={tipo} cuentas={plan} centros={centros}
    resumenInicial={resumen} periodoInicial={periodo} cargaInicial={carga} rutEmpresa={empresa.rut} />;
}
