import 'server-only';
import { randomInt } from 'node:crypto';
import { headers } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { supabaseEnv } from './env';

/** Contraseña temporal fácil de dictar (sin 0/O, 1/l/I). */
export function claveTemporal() {
  const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ', nums = '23456789';
  const t = (s: string, n: number) => Array.from({ length: n }, () => s[randomInt(s.length)]).join('');
  return `${t(letras, 4)}-${t(nums, 4)}-${t(letras, 2)}`;
}

async function urlSitio() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  const h = await headers();
  return `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`;
}

/**
 * Crea la cuenta de otra persona con una contraseña temporal, igual que si se registrara ella misma (Supabase le
 * envía el correo de confirmación). Usa un cliente aparte, sin sesión, para no tocar la sesión de quien la crea.
 * El perfil y las empresas los pone la invitación registrada antes (tg_nuevo_usuario).
 */
export async function crearCuenta(email: string, nombre: string, clave: string): Promise<{ ok: true; confirmar: boolean } | { ok: false; error: string }> {
  const { url, key } = supabaseEnv();
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await sb.auth.signUp({
    email: email.trim().toLowerCase(), password: clave,
    options: { data: { nombre: nombre.trim() || email.split('@')[0] }, emailRedirectTo: `${await urlSitio()}/auth/confirm?next=/empresas` },
  });
  if (error) return { ok: false, error: /registered|exists/i.test(error.message) ? 'Ese correo ya tiene una cuenta.' : error.message };
  // Supabase no avisa si el correo ya existía: en ese caso devuelve un usuario sin identidades
  if (data.user && !data.user.identities?.length) return { ok: false, error: 'Ese correo ya tiene una cuenta.' };
  return { ok: true, confirmar: !data.session };
}
