import type { Metadata } from 'next';
import Link from 'next/link';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { traerTodo } from '@/lib/paginar';
import { planDeEmpresa, centrosDeEmpresa } from '@/lib/datos/maestros';
import { param } from '@/lib/formato';
import { PlanCuentas } from '@/motor/plan-cuentas';
import { TablaFichas, type FichaFila } from './tabla';

export const metadata: Metadata = { title: 'Proveedores y clientes' };

export default async function FichasPage({ params, searchParams }: PageProps<'/e/[empresaId]/fichas'>) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const tipo = param(sp.tipo) === 'cliente' ? 'cliente' : 'proveedor';
  const empresa = await requerirEmpresa(empresaId);
  const supabase = await crearClienteServidor();
  const [filas, plan, centros] = await Promise.all([
    traerTodo((d, h) => supabase.from('auxiliares').select('rut,razon_social,giro,email,telefono,direccion,cuenta,centro_costo,forma_pago,activo')
      .eq('empresa_id', empresaId).eq('tipo', tipo).order('razon_social').range(d, h)),
    planDeEmpresa(empresaId),
    centrosDeEmpresa(empresaId),
  ]);
  const pc = new PlanCuentas(plan);
  const cuentas = plan.filter((c) => pc.regla(c.cd)?.aceptaMovimientos && pc.regla(c.cd)?.activa)
    .map((c) => ({ codigo: c.cd, nombre: c.nm, aceptaCC: !!pc.regla(c.cd)?.aceptaCentroCosto }));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Proveedores y clientes</h1>
          <p className="text-sm text-tenue">Ficha de cada auxiliar con la cuenta y el centro de costo que propone la importación del RCV. Las de proveedores nuevos se crean al importar su primer documento.</p>
        </div>
        <div className="flex gap-1 rounded-md border border-borde p-1 text-sm">
          <Link href="?tipo=proveedor" className={`rounded px-3 py-1 ${tipo === 'proveedor' ? 'bg-panel-2 text-acento' : 'text-tenue'}`}>Proveedores</Link>
          <Link href="?tipo=cliente" className={`rounded px-3 py-1 ${tipo === 'cliente' ? 'bg-panel-2 text-acento' : 'text-tenue'}`}>Clientes</Link>
        </div>
      </div>
      <TablaFichas key={tipo} empresaId={empresaId} tipo={tipo} filas={filas as FichaFila[]} cuentas={cuentas} centros={centros} escribe={puedeEscribir(empresa.rol)} />
    </div>
  );
}
