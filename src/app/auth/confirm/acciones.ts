'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import type { EmailOtpType } from '@supabase/supabase-js';
import { crearClienteServidor } from '@/lib/supabase/server';

const TIPOS: EmailOtpType[] = ['signup', 'email', 'recovery', 'invite', 'magiclink', 'email_change'];

/**
 * Confirma el enlace del correo recién cuando la persona aprieta el botón. Los antivirus de correo (p. ej. los
 * vínculos seguros de Outlook/Hotmail/Live) abren los enlaces antes que la persona y, si la verificación ocurriera al
 * abrir, el enlace llegaría ya usado ("expiró o ya fue usado").
 */
export async function confirmarEnlace(fd: FormData) {
  const token_hash = String(fd.get('token_hash') ?? '');
  const type = String(fd.get('type') ?? '') as EmailOtpType;
  const code = String(fd.get('code') ?? '');
  const nextRaw = String(fd.get('next') ?? '/empresas');
  const next = nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/empresas';
  const supabase = await crearClienteServidor();
  let error: string | null = 'Enlace inválido';
  let recuperacion = type === 'recovery' || next.includes('actualizar-clave');
  if (token_hash && TIPOS.includes(type)) error = (await supabase.auth.verifyOtp({ type, token_hash })).error?.message ?? null;
  else if (code) {
    const r = await supabase.auth.exchangeCodeForSession(code);
    error = r.error?.message ?? null;
    // El enlace de "Olvidé mi contraseña" puede llegar sin next: se reconoce porque se pidió hace poco
    const pedida = r.data.user?.recovery_sent_at ? Date.parse(r.data.user.recovery_sent_at) : 0;
    if (pedida && Date.now() - pedida < 60 * 60 * 1000) recuperacion = true;
  }
  if (error) {
    const msg = /verifier/i.test(error)
      ? 'Abre el enlace en el mismo navegador y en la misma dirección (contabilidad-me-app.vercel.app) donde lo pediste, o pide al administrador que restablezca tu contraseña.'
      : 'El enlace expiró o ya fue usado. Pide uno nuevo o pide al administrador que restablezca tu contraseña.';
    redirect(`/login?error=${encodeURIComponent(msg)}`);
  }
  (await cookies()).set('cme_actividad', String(Date.now()), { path: '/', maxAge: 60 * 60 * 24, sameSite: 'lax' });
  redirect(recuperacion ? '/auth/actualizar-clave' : next);
}
