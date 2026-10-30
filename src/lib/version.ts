// Versión de la app. En cada entrega se sube "version" en package.json y se anotan aquí las novedades:
// el aviso de actualización las muestra a quienes tengan abierta una versión anterior.
export const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0';
export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev';
export const BUILD_FECHA = process.env.NEXT_PUBLIC_BUILD_FECHA ?? '';

export const NOVEDADES: string[] = [
  'Importar respaldo: trae las declaraciones F29 del sistema anterior (declarado, presentado, códigos a mano, anticipo y tasa PPM por mes) y la tasa PPM de la empresa (respaldos desde V2.22.13).',
  'Si el respaldo es anterior y no trae F29, se conservan las declaraciones F29 que ya están en este sistema.',
];

/** "27-10-2026 22:30" en hora de Chile. */
export function fechaCompilacion(iso = BUILD_FECHA) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
    .format(d).replace(',', '');
}
