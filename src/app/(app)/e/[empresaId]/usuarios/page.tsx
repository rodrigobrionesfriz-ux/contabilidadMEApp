import type { Metadata } from 'next';
import { requerirEmpresa, requerirUsuario, miAcceso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { FormAgregar, FilaMiembro, Invitaciones, type Miembro } from './componentes';

export const metadata: Metadata = { title: 'Usuarios' };

export default async function UsuariosPage({ params }: PageProps<'/e/[empresaId]/usuarios'>) {
  const { empresaId } = await params;
  const [empresa, yo, acceso] = await Promise.all([requerirEmpresa(empresaId), requerirUsuario(), miAcceso()]);
  if (empresa.rol !== 'admin') return <p className="text-tenue">Sólo el dueño de la empresa o el administrador del sistema puede autorizar usuarios.</p>;
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from('miembros')
    .select('usuario_id,rol,estado,creado,perfiles(nombre,email,es_administrador,perfiles_acceso(nombre,tipo))').eq('empresa_id', empresaId).order('creado');
  if (error) throw new Error(error.message);
  const miembros = data as unknown as Miembro[];
  const { data: invitados } = await supabase.from('invitaciones').select('id,email,rol,creado').eq('empresa_id', empresaId).order('creado');
  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Usuarios de la empresa</h1>
        <p className="text-sm text-tenue">
          Autoriza a otros usuarios a trabajar en esta empresa. Qué módulos ve y edita cada uno lo define su perfil de acceso, que asigna el administrador del sistema.
          👑 Dueño: la creó y autoriza usuarios · 📝 Trabaja: según su perfil · 👁 Sólo consulta: no edita nada aunque su perfil lo permita.
        </p>
      </div>
      <div className="tarjeta divide-y divide-borde">
        {miembros.map((m) => <FilaMiembro key={m.usuario_id} empresaId={empresaId} m={m} soyYo={m.usuario_id === yo.id} admin={acceso.admin} />)}
      </div>
      <Invitaciones empresaId={empresaId} lista={invitados ?? []} />
      <FormAgregar empresaId={empresaId} admin={acceso.admin} />
    </div>
  );
}
