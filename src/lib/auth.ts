import 'server-only';
import { cache } from 'react';
import { redirect, notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { MODULOS, moduloDeRuta, permisoDe, type Permiso } from './modulos';
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
  /** El usuario es miembro de la empresa (para el administrador del sistema, las que no son suyas vienen con false). */
  propia: boolean;
  /** Dueños de la empresa (sólo se calcula para el administrador, en las empresas de otros usuarios). */
  duenos?: string[];
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

export interface Acceso {
  /** Administrador del sistema: todas las empresas, todos los permisos, edita perfiles */
  admin: boolean;
  perfil: string | null;
  tipo: 'senior' | 'contador' | null;
  permisos: Record<string, string>;
}

/** Perfil de acceso del usuario actual (tipo y permisos por módulo). */
export const miAcceso = cache(async (): Promise<Acceso> => {
  await requerirUsuario();
  const supabase = await crearClienteServidor();
  const { data } = await supabase.rpc('mi_acceso');
  const f = ((data ?? []) as { es_administrador: boolean; perfil: string | null; tipo: string | null; permisos: Record<string, string> | null }[])[0];
  return { admin: !!f?.es_administrador, perfil: f?.perfil ?? null, tipo: (f?.tipo as Acceso['tipo']) ?? null, permisos: f?.permisos ?? {} };
});

/** ¿Puede crear empresas? (administrador o perfil Senior) */
export const puedeCrearEmpresas = (a: Acceso) => a.admin || a.tipo === 'senior';

/** Empresas donde el usuario es miembro activo (el RLS filtra el resto); el administrador ve todas. */
export const empresasDelUsuario = cache(async (): Promise<EmpresaDelUsuario[]> => {
  const u = await requerirUsuario();
  const supabase = await crearClienteServidor();
  const acceso = await miAcceso();
  if (acceso.admin) {
    const [{ data: todas, error: e1 }, { data: miembros, error: e2 }] = await Promise.all([
      supabase.from('empresas').select('id, rut, razon_social, giro, creada_por'),
      supabase.from('miembros').select('empresa_id, usuario_id, rol').eq('estado', 'activo'),
    ]);
    if (e1) throw new Error(e1.message);
    if (e2) throw new Error(e2.message);
    type E = Omit<EmpresaDelUsuario, 'rol' | 'propia' | 'duenos'> & { creada_por: string | null };
    type M = { empresa_id: string; usuario_id: string; rol: Rol };
    const ms = (miembros ?? []) as M[];
    const ids = [...new Set([...ms.map((m) => m.usuario_id), ...((todas ?? []) as E[]).map((e) => e.creada_por).filter((x): x is string => !!x)])];
    const { data: perfiles } = ids.length ? await supabase.from('perfiles').select('id, nombre, email').in('id', ids) : { data: [] };
    const nombre = new Map(((perfiles ?? []) as { id: string; nombre: string | null; email: string | null }[]).map((p) => [p.id, p.nombre || p.email || 'Usuario']));
    // El administrador del sistema trabaja como dueño en todas; «propias» son aquellas donde además es miembro
    return ((todas ?? []) as E[]).map(({ creada_por, ...e }) => {
      const propia = ms.some((m) => m.empresa_id === e.id && m.usuario_id === u.id);
      const duenosIds = ms.filter((m) => m.empresa_id === e.id && m.rol === 'admin').map((m) => m.usuario_id);
      const duenos = (duenosIds.length ? duenosIds : creada_por ? [creada_por] : []).map((id) => nombre.get(id) ?? 'Usuario');
      return { ...e, rol: 'admin' as Rol, propia, duenos };
    }).sort((a, b) => a.razon_social.localeCompare(b.razon_social, 'es'));
  }
  const { data, error } = await supabase
    .from('miembros')
    .select('rol, empresas!inner(id, rut, razon_social, giro)')
    .eq('usuario_id', u.id)
    .eq('estado', 'activo');
  if (error) throw new Error(error.message);
  type Fila = { rol: Rol; empresas: { id: string; rut: string; razon_social: string; giro: string | null } };
  return ((data ?? []) as unknown as Fila[])
    .map((f) => ({ ...f.empresas, rol: f.rol, propia: true }))
    .sort((a, b) => a.razon_social.localeCompare(b.razon_social, 'es'));
});

/** Módulo de la página actual (el proxy deja la ruta en el encabezado x-ruta). */
async function moduloActual() {
  return moduloDeRuta((await headers()).get('x-ruta') ?? '');
}

/**
 * Empresa activa de la ruta; 404 si el usuario no es miembro. Aplica el perfil de acceso al módulo de la página:
 * sin acceso → vuelve al inicio de la empresa; sólo ver → el rol queda como «consulta» (sin botones de edición).
 */
export async function requerirEmpresa(empresaId: string): Promise<EmpresaDelUsuario> {
  const empresa = (await empresasDelUsuario()).find((e) => e.id === empresaId);
  if (!empresa) notFound();
  const modulo = await moduloActual();
  if (!modulo) return empresa;
  const permiso = permisoDe(await miAcceso(), modulo);
  if (permiso === 'no') redirect(`/e/${empresaId}?sin_acceso=${modulo}`);
  return permiso === 'ver' && empresa.rol !== 'consulta' ? { ...empresa, rol: 'consulta' } : empresa;
}

/** Permisos por módulo del usuario actual (para el menú). */
export async function permisosModulos(): Promise<Record<string, Permiso>> {
  const a = await miAcceso();
    return Object.fromEntries(MODULOS.map((m) => [m.k, permisoDe(a, m.k)]));
}

export const puedeEscribir = (rol: Rol) => rol === 'admin' || rol === 'contador';
