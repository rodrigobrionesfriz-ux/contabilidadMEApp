import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseEnv } from './env';

const RUTAS_PUBLICAS = ['/login', '/registro', '/recuperar', '/auth'];

/** Refresca la sesión en cada navegación y protege las rutas privadas. */
export async function actualizarSesion(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = supabaseEnv();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  // getClaims valida el JWT (no confiar en getSession en el servidor).
  const { data } = await supabase.auth.getClaims();
  const autenticado = !!data?.claims?.sub;
  const ruta = request.nextUrl.pathname;
  const publica = RUTAS_PUBLICAS.some((p) => ruta === p || ruta.startsWith(p + '/'));

  if (!autenticado && !publica) {
    const destino = request.nextUrl.clone();
    destino.pathname = '/login';
    destino.search = ruta !== '/' ? `?next=${encodeURIComponent(ruta)}` : '';
    return NextResponse.redirect(destino);
  }
  if (autenticado && (ruta === '/login' || ruta === '/registro')) {
    const destino = request.nextUrl.clone();
    destino.pathname = '/empresas';
    destino.search = '';
    return NextResponse.redirect(destino);
  }
  return response;
}
