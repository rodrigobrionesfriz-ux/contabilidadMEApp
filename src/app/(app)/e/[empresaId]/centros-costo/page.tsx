import type { Metadata } from 'next';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { FilaCentro, FormCentro, type Centro } from './componentes';

export const metadata: Metadata = { title: 'Centros de costo' };

export default async function CentrosPage({ params }: PageProps<'/e/[empresaId]/centros-costo'>) {
  const { empresaId } = await params;
  const empresa = await requerirEmpresa(empresaId);
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from('centros_costo')
    .select('codigo,nombre,nivel,padre,estado,activo').eq('empresa_id', empresaId).order('nombre');
  if (error) throw new Error(error.message);
  const centros = data as Centro[];
  const principales = centros.filter((c) => c.nivel === 1);
  const escribe = puedeEscribir(empresa.rol);
  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Centros de costo</h1>
        <p className="text-sm text-tenue">Dos niveles: centro principal (fundo, área) y subcentro (cuartel, camión, proyecto).</p>
      </div>
      {centros.length === 0 ? (
        <div className="tarjeta p-6 text-center text-tenue">Aún no hay centros de costo.</div>
      ) : (
        <div className="tarjeta divide-y divide-borde">
          {principales.map((p) => (
            <div key={p.codigo}>
              <FilaCentro empresaId={empresaId} c={p} editable={escribe} />
              {centros.filter((s) => s.padre === p.codigo).map((s) => (
                <FilaCentro key={s.codigo} empresaId={empresaId} c={s} editable={escribe} />
              ))}
            </div>
          ))}
        </div>
      )}
      {escribe && <FormCentro empresaId={empresaId} principales={principales} />}
    </div>
  );
}
