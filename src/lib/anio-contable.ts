import 'server-only';
import { cookies } from 'next/headers';

/** Cookie con el año contable elegido en la barra lateral (vale para todas las empresas). */
export const COOKIE_ANIO = 'anio_contable';

/** Año contable por defecto de las páginas: el elegido en la barra lateral o, si no hay, el año en curso. */
export async function anioContable(): Promise<number> {
  const v = Number((await cookies()).get(COOKIE_ANIO)?.value);
  return Number.isInteger(v) && v >= 2000 && v <= 2100 ? v : new Date().getFullYear();
}
