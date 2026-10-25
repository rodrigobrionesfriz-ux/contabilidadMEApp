import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseEnv } from './env';
import { moduloDeRuta, permisoDe } from '@/lib/modulos';

const RUTAS_PUBLICAS = ['/login', '/registro', '/recuperar', '/auth'];

/** Refresca la sesión en cada navegación y protege las rutas privadas. */
export async function actualizarSesion(request: NextRequest) {
  // La ruta viaja en x-ruta para que el servidor aplique el perfil de acceso del módulo (requerirEmpresa)
  const siguiente = () => {
    const h = new Headers(request.headers);
    h.set('x-ruta', request.nextUrl.pathname);
    return NextResponse.next({ request: { headers: h } });
  };
  let response = siguiente();
  const { url, key } = supabaseEnv();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = siguiente();
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
  // Acciones del servidor (POST con next-action) de un módulo sin acceso: se rechazan. Con «sólo ve» la página se
  // muestra como consulta (sin botones de edición); las acciones de lectura (exportar, buscar) siguen funcionando.
  if (autenticado && request.method === 'POST' && request.headers.get('next-action')) {
    const modulo = moduloDeRuta(ruta);
    if (modulo) {
      const { data: a } = await supabase.rpc('mi_acceso');
      const f = ((a ?? []) as { es_administrador: boolean; permisos: Record<string, string> | null }[])[0];
      if (permisoDe({ admin: !!f?.es_administrador, permisos: f?.permisos ?? {} }, modulo) === 'no') {
        return new NextResponse('Tu perfil no tiene acceso a este módulo.', { status: 403 });
      }
    }
  }
  return response;
}
