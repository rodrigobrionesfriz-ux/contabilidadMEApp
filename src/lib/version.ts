// Versión de la app. En cada entrega se sube "version" en package.json y se anotan aquí las novedades:
// el aviso de actualización las muestra a quienes tengan abierta una versión anterior.
export const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0';
export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev';
export const BUILD_FECHA = process.env.NEXT_PUBLIC_BUILD_FECHA ?? '';

export const NOVEDADES: string[] = [
  'Pagos y cobros: nueva pestaña 📜 Historial con todos los pagos a proveedores, cobros a clientes y pagos de honorarios del año, con filtros por tipo y mes y búsqueda por N°, RUT, nombre, folio, glosa o monto.',
  'Cada fila abre su asiento contable para corregirlo; el comprobante mantiene su N° y el cambio queda en el registro de actividad.',
];

/** "27-10-2026 22:30" en hora de Chile. */
export function fechaCompilacion(iso = BUILD_FECHA) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
    .format(d).replace(',', '');
}
