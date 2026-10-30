// Versión de la app. En cada entrega se sube "version" en package.json y se anotan aquí las novedades:
// el aviso de actualización las muestra a quienes tengan abierta una versión anterior.
export const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0';
export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev';
export const BUILD_FECHA = process.env.NEXT_PUBLIC_BUILD_FECHA ?? '';

export const NOVEDADES: string[] = [
  'Importar respaldo trae todo el sistema anterior: F29 y tasa PPM, configuración de la empresa y parámetros previsionales, trabajadores con sus anticipos, asistencia y libros de remuneraciones cerrados, finiquitos y contratos con sus plantillas.',
  'También las fichas de clientes y proveedores, comprobantes tipo, renta, declaraciones juradas, activo fijo e inventario (este último sólo si aquí aún no hay inventario).',
];

/** "27-10-2026 22:30" en hora de Chile. */
export function fechaCompilacion(iso = BUILD_FECHA) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
    .format(d).replace(',', '');
}
