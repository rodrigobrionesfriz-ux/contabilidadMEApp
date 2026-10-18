'use client';

import { createBrowserClient } from '@supabase/ssr';

/** Cliente Supabase en el navegador (misma sesión por cookies). Úsalo para cargas grandes por lotes. */
export function crearClienteNavegador() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
}
