import type { Metadata } from 'next';
import { requerirEmpresa } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import type { CuentaBase } from '@/motor/plan-cuentas';
import { Importador } from './importador';
import { Importaciones, type ImportacionFila } from './importaciones';

export const metadata: Metadata = { title: 'Importar respaldo' };

export default async function ImportarPage({ params }: PageProps<'/e/[empresaId]/importar'>) {
  const { empresaId } = await params;
  const empresa = await requerirEmpresa(empresaId);
  if (empresa.rol !== 'admin') return <p className="text-tenue">Sólo un administrador puede importar datos.</p>;
  const supabase = await crearClienteServidor();
  const [cuentas, imps] = await Promise.all([
    supabase.from('cuentas').select('codigo,nombre,tipo,naturaleza').eq('empresa_id', empresaId),
    supabase.from('importaciones').select('id,anio,archivo,estado,resumen,creado,terminado').eq('empresa_id', empresaId).order('anio', { ascending: false }),
  ]);
  if (cuentas.error) throw new Error(cuentas.error.message);
  const pdc: CuentaBase[] = cuentas.data.map((c) => ({ cd: c.codigo, nm: c.nombre, tp: c.tipo, nat: c.naturaleza ?? '' }));
  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Importar respaldo del sistema anterior</h1>
        <p className="mt-1 text-sm text-tenue">
          En el sistema anterior, abre la empresa y el año, entra a <b className="text-texto">⚙️ Sistema y Respaldos</b> y usa{' '}
          <b className="text-texto">📥 Exportar Excel</b>. Sube ese archivo aquí.
          Se carga un año por archivo. El sistema anterior no se modifica.
        </p>
      </div>
      <Importador empresaId={empresaId} rutEmpresa={empresa.rut} pdc={pdc} />
      <Importaciones empresaId={empresaId} filas={(imps.data ?? []) as ImportacionFila[]} />
    </div>
  );
}
