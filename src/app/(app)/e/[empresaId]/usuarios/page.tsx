import type { Metadata } from 'next';
import { requerirEmpresa, requerirUsuario } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { FormAgregar, FilaMiembro, type Miembro } from './componentes';

export const metadata: Metadata = { title: 'Usuarios' };

export default async function UsuariosPage({ params }: PageProps<'/e/[empresaId]/usuarios'>) {
  const { empresaId } = await params;
  const [empresa, yo] = await Promise.all([requerirEmpresa(empresaId), requerirUsuario()]);
  if (empresa.rol !== 'admin') return <p className="text-tenue">Sólo un administrador puede gestionar usuarios.</p>;
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from('miembros')
    .select('usuario_id,rol,estado,creado,perfiles(nombre,email)').eq('empresa_id', empresaId).order('creado');
  if (error) throw new Error(error.message);
  const miembros = data as unknown as Miembro[];
  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Usuarios de la empresa</h1>
        <p className="text-sm text-tenue">
          👑 Administrador: todo, incluidos usuarios e importación · 📝 Contador: registra y consulta · 👁 Consulta: sólo lectura.
        </p>
      </div>
      <div className="tarjeta divide-y divide-borde">
        {miembros.map((m) => <FilaMiembro key={m.usuario_id} empresaId={empresaId} m={m} soyYo={m.usuario_id === yo.id} />)}
      </div>
      <FormAgregar empresaId={empresaId} />
    </div>
  );
}
