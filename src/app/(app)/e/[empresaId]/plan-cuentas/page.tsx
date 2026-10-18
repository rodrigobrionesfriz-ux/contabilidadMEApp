import type { Metadata } from 'next';
import { requerirEmpresa } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Plan de cuentas' };

const TIPO: Record<string, string> = { T: 'Título', S: 'Subtítulo', A: 'Activo', P: 'Pasivo', C: 'Gasto/Costo', I: 'Ingreso' };

export default async function PlanCuentasPage({ params, searchParams }: PageProps<'/e/[empresaId]/plan-cuentas'>) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.trim() ?? '';
  await requerirEmpresa(empresaId);
  const supabase = await crearClienteServidor();
  let consulta = supabase
    .from('cuentas')
    .select('codigo,nombre,tipo,naturaleza,acepta_movimientos,tipo_auxiliar,acepta_centro_costo,activa')
    .eq('empresa_id', empresaId)
    .order('codigo');
  if (q) consulta = /^\d+$/.test(q) ? consulta.like('codigo', `${q}%`) : consulta.ilike('nombre', `%${q.replace(/[%_]/g, '')}%`);
  const { data, error } = await consulta;
  if (error) throw new Error(error.message);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-semibold">Plan de cuentas <span className="text-sm font-normal text-tenue">({data.length})</span></h1>
        <form className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Código o nombre…" className="campo w-60" />
          <button className="boton-sec" type="submit">Buscar</button>
        </form>
      </div>
      <div className="tarjeta overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-tenue uppercase">
            <tr className="border-b border-borde">
              <th className="px-3 py-2">Código</th><th className="px-3 py-2">Nombre</th><th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Nat.</th><th className="px-3 py-2">Auxiliar</th><th className="px-3 py-2">C. costo</th>
            </tr>
          </thead>
          <tbody>
            {data.map((c) => {
              const agrupa = !c.acepta_movimientos;
              return (
                <tr key={c.codigo} className={`border-b border-borde/50 ${agrupa ? 'bg-panel-2 font-semibold' : ''} ${c.activa ? '' : 'opacity-50'}`}>
                  <td className="num px-3 py-1.5">{c.codigo}</td>
                  <td className="px-3 py-1.5">{c.nombre}</td>
                  <td className="px-3 py-1.5 text-tenue">{TIPO[c.tipo] ?? c.tipo}</td>
                  <td className="px-3 py-1.5 text-tenue">{c.naturaleza ?? ''}</td>
                  <td className="px-3 py-1.5 text-tenue">{c.tipo_auxiliar ?? ''}</td>
                  <td className="px-3 py-1.5 text-tenue">{c.acepta_centro_costo ? 'Sí' : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
