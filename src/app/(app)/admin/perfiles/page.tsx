import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requerirUsuario, miAcceso } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { BarraUsuario } from '../../barra-usuario';
import { EditorPerfiles, type PerfilAcceso, type UsuarioSistema } from './editor';

export const metadata: Metadata = { title: 'Perfiles y usuarios' };

/** Sólo el administrador del sistema: perfiles de acceso (permisos por módulo) y perfil de cada usuario. */
export default async function PerfilesPage() {
  const [usuario, acceso] = await Promise.all([requerirUsuario(), miAcceso()]);
  if (!acceso.admin) notFound();
  const supabase = await crearClienteServidor();
  const [perfiles, usuarios, ajustes] = await Promise.all([
    supabase.from('perfiles_acceso').select('id,nombre,tipo,permisos').order('tipo').order('nombre'),
    supabase.rpc('usuarios_sistema'),
    supabase.from('ajustes_sistema').select('perfil_nuevo').maybeSingle(),
  ]);
  if (perfiles.error) throw new Error(perfiles.error.message);
  if (usuarios.error) throw new Error(usuarios.error.message);
  return (
    <>
      <BarraUsuario usuario={usuario} />
      <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6">
        <div>
          <Link href="/empresas" className="text-sm text-tenue hover:text-acento">← Empresas</Link>
          <h1 className="text-xl font-semibold">Perfiles de acceso y usuarios</h1>
          <p className="text-sm text-tenue">
            🛡️ El administrador del sistema entra a todas las empresas con todos los permisos. ⭐ Un perfil <b>Senior</b> puede crear sus empresas y autorizar
            a otros usuarios en ellas. 📝 Un perfil <b>Contador</b> sólo trabaja en las empresas que le asignen. En cada perfil defines, por módulo, si edita, sólo ve o no tiene acceso.
          </p>
        </div>
        <EditorPerfiles yo={usuario.id} perfiles={(perfiles.data ?? []) as PerfilAcceso[]} usuarios={(usuarios.data ?? []) as UsuarioSistema[]} perfilNuevo={(ajustes.data?.perfil_nuevo as string | null) ?? null} />
      </main>
    </>
  );
}
