import { VERSION, BUILD_ID, NOVEDADES } from '@/lib/version';

// Público y fuera del proxy (no renueva la sesión ni la marca de actividad): sólo dice qué versión está desplegada.
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ version: VERSION, build: BUILD_ID, novedades: NOVEDADES }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
