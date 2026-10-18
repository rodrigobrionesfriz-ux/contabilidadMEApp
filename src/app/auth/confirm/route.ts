import { type EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { crearClienteServidor } from '@/lib/supabase/server';

// Destino de los enlaces de correo (confirmación de cuenta y recuperación de clave).
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const code = searchParams.get('code');
  const nextRaw = searchParams.get('next') ?? '/empresas';
  const next = nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/empresas';
  const supabase = await crearClienteServidor();

  let error: string | null = 'Enlace inválido';
  if (token_hash && type) {
    error = (await supabase.auth.verifyOtp({ type, token_hash })).error?.message ?? null;
  } else if (code) {
    error = (await supabase.auth.exchangeCodeForSession(code)).error?.message ?? null;
  }
  const destino = request.nextUrl.clone();
  destino.search = '';
  if (error) {
    destino.pathname = '/login';
    destino.searchParams.set('error', 'El enlace expiró o ya fue usado. Solicita uno nuevo.');
  } else {
    destino.pathname = next;
  }
  return NextResponse.redirect(destino);
}
