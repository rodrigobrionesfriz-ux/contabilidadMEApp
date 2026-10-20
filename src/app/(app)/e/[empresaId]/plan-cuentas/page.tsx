import type { Metadata } from 'next';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { traerTodo } from '@/lib/paginar';
import { FilaCuenta, FormCuenta, type Cuenta } from './componentes';

export const metadata: Metadata = { title: 'Plan de cuentas' };

export default async function PlanCuentasPage({ params, searchParams }: PageProps<'/e/[empresaId]/plan-cuentas'>) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.trim() ?? '';
  const empresa = await requerirEmpresa(empresaId);
  const supabase = await crearClienteServidor();
  const data = await traerTodo((d, h) => {
    let consulta = supabase
      .from('cuentas')
      .select('codigo,nombre,tipo,naturaleza,acepta_movimientos,tipo_auxiliar,acepta_centro_costo,requiere_centro_costo,activa')
      .eq('empresa_id', empresaId);
    if (q) consulta = /^\d+$/.test(q) ? consulta.like('codigo', `${q}%`) : consulta.ilike('nombre', `%${q.replace(/[%_]/g, '')}%`);
    return consulta.order('codigo').range(d, h);
  });
  const escribe = puedeEscribir(empresa.rol);
  return (
    // En escritorio la página ocupa el alto de la ventana: título, buscador y "Nueva cuenta" quedan fijos arriba
    // y sólo la tabla se desplaza, con sus títulos fijos.
    <div className="space-y-4 md:flex md:h-[calc(100dvh-6.75rem)] md:flex-col md:space-y-0 md:gap-4">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-semibold">Plan de cuentas <span className="text-sm font-normal text-tenue">({data.length})</span></h1>
        <form className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Código o nombre…" className="campo w-60" />
          <button className="boton-sec" type="submit">Buscar</button>
        </form>
      </div>
      {escribe && <div className="shrink-0 md:max-h-[45%] md:overflow-y-auto"><FormCuenta empresaId={empresaId} /></div>}
      <div className="tarjeta min-h-0 overflow-auto max-md:max-h-[75dvh] md:flex-1">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="sticky top-0 z-10 bg-panel text-left text-xs text-tenue uppercase shadow-[0_1px_0_var(--borde)]">
            <tr className="border-b border-borde">
              <th className="px-3 py-2">Código</th><th className="px-3 py-2">Nombre</th><th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Auxiliar</th><th className="px-3 py-2">C. costo</th><th />
            </tr>
          </thead>
          <tbody>
            {(data as Cuenta[]).map((c) => <FilaCuenta key={c.codigo} empresaId={empresaId} c={c} editable={escribe} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
