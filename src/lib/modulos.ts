// Módulos de la app para los perfiles de acceso: cada sección (primer tramo de la ruta dentro de la empresa)
// pertenece a un módulo. Inicio y Primeros pasos están siempre disponibles.

export type Permiso = 'editar' | 'ver' | 'no';
export interface Modulo { k: string; nombre: string; descripcion: string; secciones: string[] }

export const MODULOS: Modulo[] = [
  { k: 'documentos', nombre: 'Compras y ventas', descripcion: 'Libros de compras y ventas, Importar RCV, Nuevo documento', secciones: ['libro', 'rcv', 'documentos'] },
  { k: 'honorarios', nombre: 'Honorarios', descripcion: 'Boletas de honorarios', secciones: ['honorarios'] },
  { k: 'remuneraciones', nombre: 'Remuneraciones', descripcion: 'Trabajadores, liquidaciones, libro, contratos, finiquitos', secciones: ['remuneraciones'] },
  { k: 'auxiliares', nombre: 'Auxiliares y pagos', descripcion: 'Pagos y cobros, proveedores y clientes, saldos de auxiliares', secciones: ['pagos', 'fichas', 'auxiliares'] },
  { k: 'comprobantes', nombre: 'Comprobantes', descripcion: 'Asientos manuales, edición y asientos tipo', secciones: ['asientos'] },
  { k: 'inventario', nombre: 'Inventario', descripcion: 'Control de inventario', secciones: ['inventario'] },
  { k: 'reportes', nombre: 'Reportes', descripcion: 'Libro diario, mayor, balances, estados, flujo de caja, libros IECV, hojas foliadas, exportar', secciones: ['diario', 'mayor', 'balance', 'estados', 'flujo-caja', 'iecv', 'hojas-foliadas', 'exportar'] },
  { k: 'conciliacion', nombre: 'Conciliación bancaria', descripcion: 'Cartolas y conciliación', secciones: ['conciliacion'] },
  { k: 'tributario', nombre: 'Tributario SII', descripcion: 'F29 y PPM, renta, declaraciones juradas', secciones: ['f29', 'renta', 'dj'] },
  { k: 'activo_fijo', nombre: 'Activo fijo', descripcion: 'Activos y depreciación', secciones: ['activo-fijo'] },
  { k: 'cierre', nombre: 'Cierre del ejercicio', descripcion: 'Cierre y reapertura del año', secciones: ['cierre'] },
  { k: 'configuracion', nombre: 'Configuración', descripcion: 'Datos de la empresa, plan de cuentas, centros de costo, apertura, importar respaldo, actividad', secciones: ['empresa', 'plan-cuentas', 'centros-costo', 'asignar-cc', 'apertura', 'importar', 'actividad'] },
  { k: 'usuarios', nombre: 'Usuarios de la empresa', descripcion: 'Autorizar usuarios en las empresas propias', secciones: ['usuarios'] },
];

export const NOMBRE_PERMISO: Record<Permiso, string> = { editar: 'Edita', ver: 'Sólo ve', no: 'Sin acceso' };

/** Módulo de una ruta dentro de la empresa ("/e/<id>/rcv/..." o "/v/<id>/diario"); null = siempre disponible. */
export function moduloDeRuta(ruta: string): string | null {
  const m = ruta.match(/^\/(e|v)\/[^/]+\/([^/?#]+)/);
  if (!m) return null;
  return MODULOS.find((x) => x.secciones.includes(m[2]))?.k ?? null;
}

/** Permiso de un módulo según el acceso del usuario (el administrador del sistema edita todo). */
export function permisoDe(acceso: { admin: boolean; permisos: Record<string, string> }, modulo: string | null): Permiso {
  if (acceso.admin || !modulo) return 'editar';
  const p = acceso.permisos[modulo];
  return p === 'editar' || p === 'ver' ? p : 'no';
}
