import 'server-only';
import { cache } from 'react';
import { redirect, notFound } from 'next/navigation';
import { crearClienteServidor } from './supabase/server';

export type Rol = 'admin' | 'contador' | 'consulta';

export interface Usuario {
  id: string;
  email: string;
  nombre: string;
}

export interface EmpresaDelUsuario {
  id: string;
  rut: string;
  razon_social: string;
  giro: string | null;
  rol: Rol;
}

/** Usuario actual validado (o redirección a /login). Memoizado por request. */
export const requerirUsuario = cache(async (): Promise<Usuario> => {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getClaims();
  const c = data?.claims;
  if (!c?.sub) redirect('/login');
  const { data: perfil } = await supabase.from('perfiles').select('nombre,email').eq('id', c.sub).maybeSingle();
  const email = (perfil?.email ?? c.email ?? '') as string;
  return { id: c.sub, email, nombre: (perfil?.nombre as string) || email.split('@')[0] };
});

/** Empresas donde el usuario es miembro activo (el RLS filtra el resto). */
export const empresasDelUsuario = cache(async (): Promise<EmpresaDelUsuario[]> => {
  const u = await requerirUsuario();
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from('miembros')
    .select('rol, empresas!inner(id, rut, razon_social, giro)')
    .eq('usuario_id', u.id)
    .eq('estado', 'activo');
  if (error) throw new Error(error.message);
  type Fila = { rol: Rol; empresas: { id: string; rut: string; razon_social: string; giro: string | null } };
  return ((data ?? []) as unknown as Fila[])
    .map((f) => ({ ...f.empresas, rol: f.rol }))
    .sort((a, b) => a.razon_social.localeCompare(b.razon_social, 'es'));
});

/** Empresa activa de la ruta; 404 si el usuario no es miembro. */
export async function requerirEmpresa(empresaId: string): Promise<EmpresaDelUsuario> {
  const empresa = (await empresasDelUsuario()).find((e) => e.id === empresaId);
  if (!empresa) notFound();
  return empresa;
}

export const puedeEscribir = (rol: Rol) => rol === 'admin' || rol === 'contador';
